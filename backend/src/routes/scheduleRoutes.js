import express from 'express';
import ScheduleRule  from '../models/ScheduleRule.js';
import ScheduleBlock from '../models/ScheduleBlock.js';
import Reservation from '../models/Reservation.js';
import { getDayOfWeek, resolveSchedule, ALL_SLOTS, toMinutes } from '../utils/scheduleUtils.js';
import { emitCourtEvent } from '../lib/emitCourtEvent.js';
import { redis } from '../lib/redisClient.js';

const router = express.Router();
const RESOLVE_CACHE_TTL_SECONDS = 120;



const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];


function resolveCacheKey(courtId, date) {
  return `schedule:resolve:${courtId}:${date}`;
}

async function invalidateResolveCache(courtId, date) {
  try {
    await redis.del(resolveCacheKey(courtId, date));
  } catch (err) {
    console.error('[schedule] cache invalidation failed:', err.message);
  }
}

// ── Default seed data ─────────────────────────────────────────────────────────
// Called once to initialise rules if none exist yet.

async function seedDefaultRules(courtId) {
  const count = await ScheduleRule.countDocuments({ courtId }); 
  if (count > 0) return;

  const defaults = [
    { courtId, dayOfWeek: 0, isClosed: false, openTime: '12:00', closeTime: '23:00' },
    { courtId, dayOfWeek: 1, isClosed: true  },
    { courtId, dayOfWeek: 2, isClosed: false, openTime: '12:00', closeTime: '23:00' },
    { courtId, dayOfWeek: 3, isClosed: false, openTime: '12:00', closeTime: '23:00' },
    { courtId, dayOfWeek: 4, isClosed: false, openTime: '12:00', closeTime: '23:00' },
    { courtId, dayOfWeek: 5, isClosed: false, openTime: '06:00', closeTime: '16:00' },
    { courtId, dayOfWeek: 6, isClosed: false, openTime: '09:00', closeTime: '23:00' },
  ];

  await ScheduleRule.insertMany(defaults);
  console.log(`[schedule] Default rules seeded for court ${courtId}`);
}
// ── Schedule Rules ────────────────────────────────────────────────────────────

/**
 * GET /api/schedule/rules
 * Returns all 7 day rules (seeds defaults if empty)
 */
router.get('/rules', async (req, res) => {
  try {
    await seedDefaultRules(req.courtId);
    const rules = await ScheduleRule.find({ courtId: req.courtId }).sort({ dayOfWeek: 1 }).lean();
    // Attach day name for frontend convenience
    const enriched = rules.map(r => ({ ...r, dayName: DAY_NAMES[r.dayOfWeek] }));
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/schedule/rules/:dayOfWeek
 * Update a single day's rule (0–6)
 */
router.put('/rules/:dayOfWeek', async (req, res) => {
  try {
    const dayOfWeek = parseInt(req.params.dayOfWeek, 10);
    if (dayOfWeek < 0 || dayOfWeek > 6) {
      return res.status(400).json({ error: 'dayOfWeek must be 0–6.' });
    }

    const { isClosed, openTime, closeTime } = req.body;
    const update = {};
    if (isClosed  !== undefined) update.isClosed  = isClosed;
    if (openTime  !== undefined) update.openTime  = openTime;
    if (closeTime !== undefined) update.closeTime = closeTime;

    const rule = await ScheduleRule.findOneAndUpdate(
      { courtId: req.courtId, dayOfWeek },
      update,
      { new: true, upsert: true, runValidators: true }
    );

    emitCourtEvent(req, 'schedule:updated', { action: 'rule_updated', dayOfWeek });
    res.json({ ...rule.toObject(), dayName: DAY_NAMES[rule.dayOfWeek] });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Schedule Blocks ───────────────────────────────────────────────────────────

/**
 * GET /api/schedule/blocks?date=YYYY-MM-DD
 * Returns all blocks, optionally filtered by date
 */
router.get('/blocks', async (req, res) => {
  try {
    const filter = { courtId: req.courtId };
    if (req.query.date) filter.date = req.query.date;
    const blocks = await ScheduleBlock.find(filter).sort({ date: 1, startTime: 1 }).lean();
    res.json(blocks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/schedule/blocks
 * Create a new block
 */
router.post('/blocks', async (req, res) => {
  try {
    const { date, courts = [], blockType = 'day', startTime, endTime, reason } = req.body;
    if (!date) return res.status(400).json({ error: 'date is required.' });
    if (blockType === 'range' && (!startTime || !endTime)) {
      return res.status(400).json({ error: 'startTime and endTime required for range blocks.' });
    }

    const blockStart = blockType === 'day' ? 0 : toMinutes(startTime);
    const blockEnd = blockType === 'day' ? 24 * 60 : toMinutes(endTime);
    if (!Number.isInteger(blockStart) || !Number.isInteger(blockEnd) || blockStart >= blockEnd) {
      return res.status(400).json({ error: 'Invalid block time range.' });
    }

    const activeReservations = await Reservation.find({
      courtId: req.courtId,
      date,
      status: { $in: ['pending', 'pending_admin', 'approved_waiting_payment', 'payment_processing', 'payment_received', 'confirmed', 'completed'] },
      ...(courts.length ? { court: { $in: courts } } : {}),
    }).select('court timeSlot duration').lean();
    const conflict = activeReservations.find(reservation => {
      const reservationStart = toMinutes(reservation.timeSlot.split('-')[0]);
      const reservationEnd = reservationStart + Number(reservation.duration || 1) * 60;
      return reservationStart < blockEnd && reservationEnd > blockStart;
    });
    if (conflict) {
      return res.status(409).json({ error: 'This block overlaps an existing reservation.' });
    }

    const block = await ScheduleBlock.create({ courtId: req.courtId, date, courts, blockType, startTime, endTime, reason });
    emitCourtEvent(req, 'schedule:updated', { action: 'block_created', blockId: block._id });
    await invalidateResolveCache(req.courtId, date);
    res.status(201).json(block);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /api/schedule/blocks/:id
 * Remove a block
 */
router.delete('/blocks/:id', async (req, res) => {
  try {
    const deleted = await ScheduleBlock.findOneAndDelete({ _id: req.params.id, courtId: req.courtId });
    if (!deleted) return res.status(404).json({ error: 'Block not found.' });
    emitCourtEvent(req, 'schedule:updated', { action: 'block_deleted', blockId: req.params.id });
    await invalidateResolveCache(req.courtId, deleted.date);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/schedule/resolve?date=YYYY-MM-DD
 * Public + admin: returns full resolved schedule for a date.
 * Used by booking page to know what's open before fetching reservations.
 */
router.get('/resolve', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date is required.' });

    const cacheKey = resolveCacheKey(req.courtId, date);

    try {
      const cached = await redis.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));
    } catch (err) {
      console.error('[schedule] cache read failed, falling back to DB:', err.message);
    }

    await seedDefaultRules(req.courtId);

    const dayOfWeek = getDayOfWeek(date);
    const [rule, blocks] = await Promise.all([
      ScheduleRule.findOne({ courtId: req.courtId, dayOfWeek }).lean(),
      ScheduleBlock.find({ courtId: req.courtId, date }).lean(),
    ]);

    const { isFullyClosed, baseSlots, perCourt } = resolveSchedule(rule, blocks);

    const payload = {
      date,
      dayOfWeek,
      dayName: DAY_NAMES[dayOfWeek],
      isFullyClosed,
      baseSlots,
      perCourt,
      blocks,
    };

    try {
      await redis.set(cacheKey, JSON.stringify(payload), 'EX', RESOLVE_CACHE_TTL_SECONDS);
    } catch (err) {
      console.error('[schedule] cache write failed:', err.message);
    }

    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;