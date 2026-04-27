import express from 'express';
import { Resend } from 'resend';
import Reservation   from '../models/Reservation.js';
import Court from '../models/Court.js';
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
import { createPaymentLink } from '../lib/payments/index.js';
import { emitCourtEvent } from '../lib/emitCourtEvent.js';
import { transitionReservationPayment } from '../lib/reservationStateMachine.js';

const router = express.Router();
const PAYMENT_HOLD_MINUTES = Math.max(1, Number(process.env.PAYMENT_HOLD_MINUTES || 10));

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
    const filter = { courtId: req.courtId };
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
      ScheduleRule.findOne({ courtId: req.courtId ,dayOfWeek }).lean(),
      ScheduleBlock.find({ courtId: req.courtId ,date }).lean(),
      Reservation.find({ courtId: req.courtId , date, status: { $in: ['confirmed', 'completed'] } })
        .select('court timeSlot duration').lean(),
    ]);

    const { isFullyClosed, baseSlots, perCourt } = resolveSchedule(rule, blocks);

    // Current time in minutes — only relevant when date is today (use local PH time via offset)
    const nowUtc     = new Date();
    // PHT = UTC+8. Using getTime() + offset to get local mins without relying on server TZ
    const phOffset   = 8 * 60; // Philippines is UTC+8, no DST
    const phMins     = (nowUtc.getUTCHours() * 60 + nowUtc.getUTCMinutes() + phOffset) % (24 * 60);
    const phDateStr  = (() => {
      const phDate = new Date(nowUtc.getTime() + phOffset * 60 * 1000);
      return phDate.toISOString().slice(0, 10);
    })();
    const isToday    = date === phDateStr;

    // Filter base slots to those valid for the requested duration AND not fully in the past
    const validBase = baseSlots.filter(slot => {
      const startMins = toMinutes(slot.split('-')[0]);
      // Rule 1: slot + duration must not exceed 23:00
      if (startMins + durationHours * 60 > 23 * 60) return false;
      // Rule 2: for today, only block if the slot has completely ended (start + 1hr <= now)
      // This allows booking the currently-running hour slot
      if (isToday && startMins + 60 <= phMins) return false;
      return true;
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
      ScheduleRule.findOne({ courtId: req.courtId , dayOfWeek }).lean(),
      ScheduleBlock.find({ courtId: req.courtId , date }).lean(),
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
      .find({ courtId: req.courtId, court, date, status: { $in: ['confirmed', 'completed'] } })
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
    if (String(err.message || '').includes('Invalid reservation status transition') ||
        String(err.message || '').includes('Invalid payment status transition')) {
      return res.status(409).json({ error: err.message });
    }
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
    const reservation = await Reservation.findOneAndUpdate(
      { _id: req.params.id, courtId: req.courtId }, 
      update,
      { new: true, runValidators: true }
    );
    if (!reservation) return res.status(404).json({ error: 'Reservation not found.' });
    if (status === 'confirmed' && reservation.email) {
      sendConfirmationEmail(reservation).catch(err =>
        console.error('[email] Failed:', err.message)
      );
    }
    emitCourtEvent(req, 'reservation:updated', { action: 'updated', reservationId: reservation._id, status: reservation.status });
    emitCourtEvent(req, 'analytics:refresh', { source: 'reservations' });
    res.json(reservation);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/reservations/:id/approve-payment
 * Admin approves reservation and creates/reuses one payment intent.
 */
router.post('/:id/approve-payment', async (req, res) => {
  try {
    const reservation = await Reservation.findOne({
      _id: req.params.id,
      courtId: req.courtId,
    });
    if (!reservation) return res.status(404).json({ error: 'Reservation not found.' });
    if (['cancelled', 'expired', 'completed'].includes(reservation.status)) {
      return res.status(400).json({ error: 'Reservation is not payable anymore.' });
    }
    if (!['pending_admin', 'approved_waiting_payment'].includes(reservation.status)) {
      return res.status(409).json({ error: `Cannot approve payment from status "${reservation.status}".` });
    }

    if (
      reservation.paymentStatus === 'awaiting_payment' &&
      reservation.paymentUrl &&
      reservation.paymentExpiresAt &&
      new Date(reservation.paymentExpiresAt) > new Date()
    ) {
      return res.json(reservation);
    }

    const reservationStart = new Date(`${reservation.date}T${reservation.timeSlot.split('-')[0]}:00+08:00`);
    const holdExpiry = new Date(Date.now() + PAYMENT_HOLD_MINUTES * 60 * 1000);
    const in24h = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const expiryDate = [reservationStart, holdExpiry, in24h]
      .filter((d) => d instanceof Date && !Number.isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const payableBase = reservation.paymentOption === 'full'
      ? Number(reservation.reservationFeeAmount || 0)
      : Number(reservation.downpaymentAmount || 0);
    const amount = Number((payableBase + Number(reservation.maintenanceFeeAmount || 0)).toFixed(2));

    const appBase = process.env.APP_BASE_URL || 'http://localhost:3000';
    const court = await Court.findById(reservation.courtId).select('slug').lean();
    if (!court?.slug) {
      return res.status(400).json({ error: 'Court slug not found for reservation payment redirect.' });
    }
    const statusPath = `/book/${court.slug}/status/${reservation.publicRef}`;
    const paymentLink = await createPaymentLink({
      referenceId: `${reservation._id}-${Date.now()}`,
      amount,
      description: `Reservation ${reservation.publicRef}`,
      payerEmail: reservation.email,
      successUrl: `${appBase}${statusPath}`,
      failureUrl: `${appBase}${statusPath}`,
      expiryDate,
      metadata: {
        type: 'reservation',
        courtId: String(reservation.courtId),
        reservationId: String(reservation._id),
      },
    });

    transitionReservationPayment(reservation, 'approved_waiting_payment', 'awaiting_payment');
    reservation.paymentLinkId = paymentLink.id || paymentLink.payment_id || '';
    reservation.paymentUrl = paymentLink.payment_url || paymentLink.checkout_url || '';
    reservation.paymentQrString = paymentLink.qr_string || '';
    reservation.paymentExpiresAt = expiryDate;
    await reservation.save();
    emitCourtEvent(req, 'reservation:updated', { action: 'awaiting_payment', reservationId: reservation._id, status: reservation.status });
    res.json(reservation);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/reservations/:id/cancel-payment
 * Admin cancels a waiting payment reservation.
 */
router.post('/:id/cancel-payment', async (req, res) => {
  try {
    const existing = await Reservation.findOne({ _id: req.params.id, courtId: req.courtId });
    if (!existing) return res.status(404).json({ error: 'Reservation not found.' });
    if (!['pending_admin', 'approved_waiting_payment'].includes(existing.status)) {
      return res.status(409).json({ error: `Cannot cancel payment from status "${existing.status}".` });
    }
    transitionReservationPayment(existing, 'cancelled', 'cancelled');
    const reservation = await Reservation.findOneAndUpdate(
      { _id: req.params.id, courtId: req.courtId },
      { status: existing.status, paymentStatus: existing.paymentStatus },
      { new: true }
    );
    if (!reservation) return res.status(404).json({ error: 'Reservation not found.' });
    emitCourtEvent(req, 'reservation:updated', { action: 'cancelled', reservationId: reservation._id, status: reservation.status });
    emitCourtEvent(req, 'analytics:refresh', { source: 'reservations' });
    res.json(reservation);
  } catch (err) {
    if (String(err.message || '').includes('Invalid reservation status transition') ||
        String(err.message || '').includes('Invalid payment status transition')) {
      return res.status(409).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/reservations/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Reservation.findByIdAndDelete(
      {_id: req.params.id, courtId: req.courtId });
    if (!deleted) return res.status(404).json({ error: 'Reservation not found.' });
    emitCourtEvent(req, 'reservation:updated', { action: 'deleted', reservationId: req.params.id });
    emitCourtEvent(req, 'analytics:refresh', { source: 'reservations' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;