import express from 'express';
import Court       from '../models/Court.js';
import Reservation from '../models/Reservation.js';
import ScheduleRule  from '../models/ScheduleRule.js';
import ScheduleBlock from '../models/ScheduleBlock.js';
import User from '../models/User.js';
import {
  ALL_SLOTS, toMinutes, getDayOfWeek,
  resolveSchedule, getBlockedSlots,
} from '../utils/scheduleUtils.js';

const router = express.Router();

// GET /api/public/courts — landing page directory
router.get('/courts', async (req, res) => {
  try {
    const courts = await Court.find({
      isActive: true,
      'subscription.status': { $in: ['active', 'trial'] },
    }).select('name slug sports courtCount location contact description').lean();
    res.json(courts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/public/courts/:slug — single court info for booking page
router.get('/courts/:slug', async (req, res) => {
  try {
    const court = await Court.findOne({ slug: req.params.slug, isActive: true })
      .select('name slug sports courtCount location contact description logoUrl amenities settings')
      .lean();
    if (!court) return res.status(404).json({ error: 'Court not found.' });
    res.json(court);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/public/courts/:slug/availability?date=YYYY-MM-DD&duration=1
router.get('/courts/:slug/availability', async (req, res) => {
  try {
    const { date, duration = '1' } = req.query;
    if (!date) return res.status(400).json({ error: 'date is required' });

    const court = await Court.findOne({ slug: req.params.slug, isActive: true }).lean();
    if (!court) return res.status(404).json({ error: 'Court not found.' });

    const courtId     = court._id;
    const durationHrs = Math.max(1, parseInt(duration, 10));
    const dayOfWeek   = getDayOfWeek(date);

    const [rule, blocks, activeReservations] = await Promise.all([
      ScheduleRule.findOne({ courtId, dayOfWeek }).lean(),
      ScheduleBlock.find({ courtId, date }).lean(),
      Reservation.find({ courtId, date, status: { $in: ['pending', 'confirmed'] } })
        .select('court timeSlot duration').lean(),
    ]);

    const { isFullyClosed, baseSlots, perCourt } = resolveSchedule(rule, blocks);

    const nowUtc    = new Date();
    const phOffset  = 8 * 60;
    const phMins    = (nowUtc.getUTCHours() * 60 + nowUtc.getUTCMinutes() + phOffset) % (24 * 60);
    const phDateStr = new Date(nowUtc.getTime() + phOffset * 60 * 1000).toISOString().slice(0, 10);
    const isToday   = date === phDateStr;

    const validBase = baseSlots.filter(slot => {
      const startMins = toMinutes(slot.split('-')[0]);
      if (startMins + durationHrs * 60 > 23 * 60) return false;
      if (isToday && startMins + 60 <= phMins) return false;
      return true;
    });

    const courtNums = Array.from({ length: court.courtCount }, (_, i) => i + 1);
    const result = courtNums.map(courtNum => {
      if (isFullyClosed) return { court: courtNum, isFullyClosed: true, availableSlots: [], blockedSlots: ALL_SLOTS };
      const adminBlocked       = perCourt[courtNum]?.adminBlockedSlots ?? [];
      const openForThisCourt   = validBase.filter(s => !adminBlocked.includes(s));
      const reservationBlocked = getBlockedSlots(
        activeReservations.filter(r => r.court === courtNum),
        openForThisCourt, durationHrs
      );
      return {
        court: courtNum,
        isFullyClosed: false,
        availableSlots: openForThisCourt.filter(s => !reservationBlocked.includes(s)),
        blockedSlots: [
          ...ALL_SLOTS.filter(s => !validBase.includes(s)),
          ...adminBlocked,
          ...reservationBlocked,
        ],
      };
    });

    res.json({ isFullyClosed, courts: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/public/courts/:slug/schedule — operating hours
router.get('/courts/:slug/schedule', async (req, res) => {
  try {
    const court = await Court.findOne({ slug: req.params.slug }).lean();
    if (!court) return res.status(404).json({ error: 'Court not found.' });
    const rules = await ScheduleRule.find({ courtId: court._id }).sort({ dayOfWeek: 1 }).lean();
    const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    res.json(rules.map(r => ({ ...r, dayName: DAY_NAMES[r.dayOfWeek] })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/public/courts/:slug/reserve — public booking
router.post('/courts/:slug/reserve', async (req, res) => {
  try {
    const court = await Court.findOne({ slug: req.params.slug, isActive: true }).lean();
    if (!court) return res.status(404).json({ error: 'Court not found.' });
    if (court.subscription.status === 'expired' || court.subscription.status === 'suspended') {
      return res.status(403).json({ error: 'This court is not accepting bookings.' });
    }

    const { courtNum, date, timeSlot, duration = 1, name, phone, email = '', playerCount = 2, notes = '' } = req.body;
    if (!courtNum || !date || !timeSlot || !name || !phone) {
      return res.status(400).json({ error: 'courtNum, date, timeSlot, name, and phone are required.' });
    }

    const courtId   = court._id;
    const startMins = toMinutes(timeSlot.split('-')[0]);
    const endMins   = startMins + Number(duration) * 60;
    const dayOfWeek = getDayOfWeek(date);

    const [rule, blocks] = await Promise.all([
      ScheduleRule.findOne({ courtId, dayOfWeek }).lean(),
      ScheduleBlock.find({ courtId, date }).lean(),
    ]);

    const { isFullyClosed, baseSlots, perCourt } = resolveSchedule(rule, blocks);
    if (isFullyClosed) return res.status(403).json({ error: 'The venue is closed on this date.' });

    const startHour  = Math.floor(startMins / 60);
    const baseSlotKey = `${String(startHour).padStart(2,'0')}:00-${String(startHour+1).padStart(2,'0')}:00`;
    if (!baseSlots.includes(baseSlotKey)) return res.status(403).json({ error: 'Outside open hours.' });
    if (perCourt[courtNum]?.adminBlockedSlots?.includes(baseSlotKey)) {
      return res.status(403).json({ error: 'This slot has been blocked.' });
    }

    const active = await Reservation.find({ courtId, court: courtNum, date, status: { $in: ['pending','confirmed'] } })
      .select('timeSlot duration').lean();
    const hasConflict = active.some(e => {
      const exStart = toMinutes(e.timeSlot.split('-')[0]);
      const exEnd   = exStart + e.duration * 60;
      return startMins < exEnd && endMins > exStart;
    });
    if (hasConflict) return res.status(409).json({ error: 'This slot is already booked.' });

    const endHour = String(Math.floor(endMins / 60)).padStart(2,'0');
    const endMin  = String(endMins % 60).padStart(2,'0');
    const reservation = await Reservation.create({
      courtId,
      court:       Number(courtNum),
      date, name, phone, email, playerCount, notes,
      timeSlot:    `${timeSlot.split('-')[0]}-${endHour}:${endMin}`,
      duration:    Number(duration),
      status:      'pending',
    });

    res.status(201).json(reservation);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/public/register-court
router.post('/register-court', async (req, res) => {
  try {
    const { name, slug, adminEmail, sports = ['badminton'], courtCount = 4, location = {}, contact = {} } = req.body;
    if (!name || !slug || !adminEmail) {
      return res.status(400).json({ error: 'name, slug, and adminEmail are required.' });
    }
    const existing = await Court.findOne({ slug: slug.toLowerCase() });
    if (existing) return res.status(409).json({ error: 'This slug is already taken.' });

    const court = await Court.create({
      name, slug, adminEmail, sports, courtCount,
      location, contact,
      subscription: { status: 'trial' },
      isPublic: false, isActive: true,
    });

    await User.findOneAndUpdate(
      { email: adminEmail.toLowerCase() },
      {
        $set:         { courtId: court._id, role: 'admin' },
        $setOnInsert: { provider: 'google', name: '' },
      },
      { upsert: true, new: true }
    );

    res.status(201).json({
      success: true,
      courtId: court._id,
      slug:    court.slug,
      message: 'Court registered. Your 14-day trial has started.',
    });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Slug already taken.' });
    res.status(400).json({ error: err.message });
  }
});

export default router;