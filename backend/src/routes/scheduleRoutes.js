import express from 'express';
import ScheduleRule  from '../models/ScheduleRule.js';
import ScheduleBlock from '../models/ScheduleBlock.js';
import { getDayOfWeek, resolveSchedule, ALL_SLOTS } from '../utils/scheduleUtils.js';

const router = express.Router();

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// ── Default seed data ─────────────────────────────────────────────────────────
// Called once to initialise rules if none exist yet.

async function seedDefaultRules() {
  const count = await ScheduleRule.countDocuments();
  if (count > 0) return;

  const defaults = [
    { dayOfWeek: 0, isClosed: false, openTime: '12:00', closeTime: '23:00' }, // Sun
    { dayOfWeek: 1, isClosed: true  },                                         // Mon — closed
    { dayOfWeek: 2, isClosed: false, openTime: '12:00', closeTime: '23:00' }, // Tue
    { dayOfWeek: 3, isClosed: false, openTime: '12:00', closeTime: '23:00' }, // Wed
    { dayOfWeek: 4, isClosed: false, openTime: '12:00', closeTime: '23:00' }, // Thu
    { dayOfWeek: 5, isClosed: false, openTime: '06:00', closeTime: '16:00' }, // Fri
    { dayOfWeek: 6, isClosed: false, openTime: '09:00', closeTime: '23:00' }, // Sat
  ];

  await ScheduleRule.insertMany(defaults);
  console.log('[schedule] Default rules seeded.');
}

// ── Schedule Rules ────────────────────────────────────────────────────────────

/**
 * GET /api/schedule/rules
 * Returns all 7 day rules (seeds defaults if empty)
 */
router.get('/rules', async (req, res) => {
  try {
    await seedDefaultRules();
    const rules = await ScheduleRule.find().sort({ dayOfWeek: 1 }).lean();
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
      { dayOfWeek },
      update,
      { new: true, upsert: true, runValidators: true }
    );

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
    const filter = {};
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

    const block = await ScheduleBlock.create({ date, courts, blockType, startTime, endTime, reason });
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
    const deleted = await ScheduleBlock.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Block not found.' });
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

    await seedDefaultRules();

    const dayOfWeek = getDayOfWeek(date);
    const [rule, blocks] = await Promise.all([
      ScheduleRule.findOne({ dayOfWeek }).lean(),
      ScheduleBlock.find({ date }).lean(),
    ]);

    const { isFullyClosed, baseSlots, perCourt } = resolveSchedule(rule, blocks);

    res.json({
      date,
      dayOfWeek,
      dayName:      DAY_NAMES[dayOfWeek],
      isFullyClosed,
      baseSlots,    // slots open per weekly rule (before reservations)
      perCourt,     // per-court admin blocks
      blocks,       // raw blocks for admin display
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;