import express from 'express';
import { Resend } from 'resend';
import Reservation   from '../models/Reservation.js';
import ScheduleRule  from '../models/ScheduleRule.js';
import ScheduleBlock from '../models/ScheduleBlock.js';
import { buildConfirmationEmail } from '../emails/confirmationEmail.js';
import {
  ALL_SLOTS,
  toMinutes,
  getDayOfWeek,
  resolveSchedule,
  getBlockedSlots,
} from '../utils/scheduleUtils.js';

const router = express.Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Given existing reservations for a court, return which start slots
 * are blocked for a new booking of `durationHours` length.
 */
async function sendConfirmationEmail(reservation) {
  // Lazy-init so dotenv has already loaded by the time this runs
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { to, subject, html } = buildConfirmationEmail(reservation);
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'noreply@yourdomain.com',
    to, subject, html,
  });
  console.log(`[email] Confirmation sent to ${to}`);
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/reservations
 * Admin: list all, supports ?date=&status= filters
 */
router.get('/', async (req, res) => {
  try {
    const { date, status } = req.query;
    const filter = {};
    if (date)                       filter.date   = date;
    if (status && status !== 'all') filter.status = status;
    const reservations = await Reservation.find(filter).sort({ date: 1, timeSlot: 1 }).lean();
    res.json(reservations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/reservations/availability?date=YYYY-MM-DD&duration=1
 * Public: returns availability per court, respecting:
 *   1. ScheduleRule (weekly open hours)
 *   2. ScheduleBlocks (admin date/court overrides)
 *   3. Existing reservations (overlap detection)
 */
router.get('/availability', async (req, res) => {
  try {
    const { date, duration = '1' } = req.query;
    if (!date) return res.status(400).json({ error: 'date is required' });

    const durationHours = Math.max(1, parseInt(duration, 10));
    const dayOfWeek     = getDayOfWeek(date);

    // Fetch schedule data and reservations in parallel
    const [rule, blocks, activeReservations] = await Promise.all([
      ScheduleRule.findOne({ dayOfWeek }).lean(),
      ScheduleBlock.find({ date }).lean(),
      Reservation.find({ date, status: { $in: ['pending', 'confirmed'] } })
        .select('court timeSlot duration').lean(),
    ]);

    const { isFullyClosed, baseSlots, perCourt } = resolveSchedule(rule, blocks);

    // Filter base slots to those valid for the requested duration
    const validBase = baseSlots.filter(slot => {
      const startMins = toMinutes(slot.split('-')[0]);
      return startMins + durationHours * 60 <= 23 * 60;
    });

    const result = [1, 2, 3, 4].map(courtNum => {
      if (isFullyClosed) {
        return { court: courtNum, isFullyClosed: true, availableSlots: [], blockedSlots: ALL_SLOTS };
      }

      const adminBlocked       = perCourt[courtNum].adminBlockedSlots;
      const openForThisCourt   = validBase.filter(s => !adminBlocked.includes(s));
      const reservationBlocked = getBlockedSlots(
        activeReservations.filter(r => r.court === courtNum),
        openForThisCourt,
        durationHours
      );

      const availableSlots = openForThisCourt.filter(s => !reservationBlocked.includes(s));

      return {
        court:        courtNum,
        isFullyClosed: false,
        availableSlots,
        blockedSlots: [
          ...ALL_SLOTS.filter(s => !validBase.includes(s)), // outside open hours
          ...adminBlocked,                                   // admin blocked
          ...reservationBlocked,                             // reserved
        ],
        // Breakdown for admin debugging (not needed by frontend but useful)
        _meta: {
          outsideHours:  ALL_SLOTS.filter(s => !validBase.includes(s)).length,
          adminBlocked:  adminBlocked.length,
          reserved:      reservationBlocked.length,
        },
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/reservations
 * Public: create a reservation — validates against schedule + overlaps
 */
router.post('/', async (req, res) => {
  try {
    const { court, date, timeSlot, duration = 1, name, phone } = req.body;
    if (!court || !date || !timeSlot || !name || !phone) {
      return res.status(400).json({ error: 'court, date, timeSlot, name, and phone are required.' });
    }

    const startMins = toMinutes(timeSlot.split('-')[0]);
    const endMins   = startMins + Number(duration) * 60;
    const dayOfWeek = getDayOfWeek(date);

    // Validate against schedule
    const [rule, blocks] = await Promise.all([
      ScheduleRule.findOne({ dayOfWeek }).lean(),
      ScheduleBlock.find({ date }).lean(),
    ]);

    const { isFullyClosed, baseSlots, perCourt } = resolveSchedule(rule, blocks);

    if (isFullyClosed) {
      return res.status(403).json({ error: 'The venue is closed on this date.' });
    }

    // Check slot is within open hours
    const slotKey = `${String(Math.floor(startMins/60)).padStart(2,'0')}:${String(startMins%60).padStart(2,'0')}-${String(Math.floor(startMins/60+1)).padStart(2,'0')}:${String(startMins%60).padStart(2,'0')}`;
    const startHour = Math.floor(startMins / 60);
    const baseSlotKey = `${String(startHour).padStart(2,'0')}:00-${String(startHour+1).padStart(2,'0')}:00`;

    if (!baseSlots.includes(baseSlotKey)) {
      return res.status(403).json({ error: 'This time is outside the venue\'s open hours.' });
    }

    // Check admin blocks for this court
    const adminBlocked = perCourt[court].adminBlockedSlots;
    if (adminBlocked.includes(baseSlotKey)) {
      return res.status(403).json({ error: 'This time slot has been blocked by the venue.' });
    }

    // Check reservation overlaps
    const active = await Reservation
      .find({ court, date, status: { $in: ['pending', 'confirmed'] } })
      .select('timeSlot duration').lean();

    const hasConflict = active.some(existing => {
      const exStart = toMinutes(existing.timeSlot.split('-')[0]);
      const exEnd   = exStart + existing.duration * 60;
      return startMins < exEnd && endMins > exStart;
    });

    if (hasConflict) {
      return res.status(409).json({ error: 'This time slot overlaps with an existing booking.' });
    }

    // Store canonical slot with actual end time
    const endHour = String(Math.floor(endMins / 60)).padStart(2, '0');
    const endMin  = String(endMins % 60).padStart(2, '0');
    const canonicalSlot = `${timeSlot.split('-')[0]}-${endHour}:${endMin}`;

    const reservation = await Reservation.create({
      ...req.body,
      timeSlot: canonicalSlot,
      duration: Number(duration),
    });

    res.status(201).json(reservation);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * PUT /api/reservations/:id
 * Admin: update status and/or notes — sends email on confirm
 */
router.put('/:id', async (req, res) => {
  try {
    const { status, notes } = req.body;
    const update = {};
    if (status !== undefined) update.status = status;
    if (notes  !== undefined) update.notes  = notes;
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'Provide status or notes to update.' });
    }
    const reservation = await Reservation.findByIdAndUpdate(
      req.params.id, update, { new: true, runValidators: true }
    );
    if (!reservation) return res.status(404).json({ error: 'Reservation not found.' });
    if (status === 'confirmed' && reservation.email) {
      sendConfirmationEmail(reservation).catch(err =>
        console.error('[email] Failed:', err.message)
      );
    }
    res.json(reservation);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /api/reservations/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Reservation.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Reservation not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;