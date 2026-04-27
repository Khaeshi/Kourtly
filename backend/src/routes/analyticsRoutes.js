import express from 'express';
import mongoose from 'mongoose';
import { generateAIText } from '../lib/ai/index.js';

const router = express.Router();
const DAILY_AI_LIMIT = 10;

// Lazy-load models to avoid circular import issues
const getModels = () => ({
  Reservation: mongoose.model('Reservation'),
  Tab:         mongoose.model('Tab'),
  Player:      mongoose.model('Player'),
  Match:       mongoose.model('Match'),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns { start, end } Date objects for a given period + anchor date */
function getPeriodRange(period, anchor = new Date()) {
  const d = new Date(anchor);
  d.setHours(0, 0, 0, 0);

  switch (period) {
    case 'today': {
      const end = new Date(d); end.setHours(23, 59, 59, 999);
      return { start: d, end };
    }
    case 'week': {
      const start = new Date(d);
      start.setDate(d.getDate() - d.getDay()); // Sunday
      const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case 'month': {
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start, end };
    }
    case 'year': {
      const start = new Date(d.getFullYear(), 0, 1);
      const end   = new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
      return { start, end };
    }
    default:
      throw new Error(`Unknown period: ${period}`);
  }
}

/** Format a Date as YYYY-MM-DD */
function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

/** Build array of date strings between start and end inclusive */
function buildDateRange(start, end) {
  const dates = [];
  const cur = new Date(start);
  while (cur <= end) {
    dates.push(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function requireAdmin(req, res) {
  if (!['admin', 'superadmin'].includes(req.userRole)) {
    res.status(403).json({ error: 'Admin access required.' });
    return false;
  }
  return true;
}

function todayKeyPHT() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

async function consumeAnalyticsAskQuota(courtId) {
  const Court = mongoose.model('Court');
  const key = todayKeyPHT();
  const court = await Court.findOneAndUpdate(
    { _id: courtId },
    {
      $setOnInsert: {},
      $set: { updatedAt: new Date() },
    },
    { new: true }
  ).lean();

  const quota = court?.analyticsAskQuota || {};
  let day = quota.day || '';
  let count = Number(quota.count || 0);
  if (day !== key) {
    day = key;
    count = 0;
  }
  if (count >= DAILY_AI_LIMIT) return false;

  await Court.updateOne(
    { _id: courtId },
    { $set: { analyticsAskQuota: { day, count: count + 1 } } }
  );
  return true;
}

async function buildSummary(courtId, period) {
  const { start, end } = getPeriodRange(period);
  const { Reservation, Tab, Player, Match } = getModels();
  const RESERVATION_FEE = 210;

  const [allReservations, paidTabs, totalPlayers, matches] = await Promise.all([
    Reservation.find({
      courtId,
      createdAt: { $gte: start, $lte: end },
    }).lean(),
    Tab.find({
      courtId,
      status: 'paid',
      updatedAt: { $gte: start, $lte: end },
    }).lean(),
    Player.countDocuments({ courtId }),
    Match.find({
      courtId,
      status: 'done',
      updatedAt: { $gte: start, $lte: end },
    }).lean(),
  ]);

  const reservationStats = {
    total: allReservations.length,
    confirmed: allReservations.filter((r) => r.status === 'confirmed').length,
    pending: allReservations.filter((r) => r.status === 'pending').length,
    cancelled: allReservations.filter((r) => r.status === 'cancelled').length,
    completed: allReservations.filter((r) => r.status === 'completed').length,
  };

  const confirmedReservations = allReservations.filter((r) => r.status === 'confirmed' || r.status === 'completed');
  const totalReservationRevenue = confirmedReservations.length * RESERVATION_FEE;
  const totalBillingRevenue = paidTabs.reduce((sum, t) => sum + (t.total ?? 0), 0);
  const avgPerTab = paidTabs.length > 0 ? Math.round(totalBillingRevenue / paidTabs.length) : 0;

  const dateList = buildDateRange(start, end);
  const resByDate = {};
  confirmedReservations.forEach((r) => {
    const d = r.date;
    resByDate[d] = (resByDate[d] ?? 0) + RESERVATION_FEE;
  });
  const billingByDate = {};
  paidTabs.forEach((t) => {
    const d = toDateStr(new Date(t.updatedAt));
    billingByDate[d] = (billingByDate[d] ?? 0) + (t.total ?? 0);
  });
  const revenueByDay = dateList.map((date) => ({
    date,
    reservationRevenue: resByDate[date] ?? 0,
    billingRevenue: billingByDate[date] ?? 0,
    total: (resByDate[date] ?? 0) + (billingByDate[date] ?? 0),
  }));

  const courtMap = {};
  confirmedReservations.forEach((r) => {
    const c = r.court;
    if (!courtMap[c]) courtMap[c] = { bookings: 0, hours: 0 };
    courtMap[c].bookings += 1;
    courtMap[c].hours += r.duration ?? 1;
  });
  const courtUtilization = [1, 2, 3, 4].map((c) => ({
    court: c,
    bookings: courtMap[c]?.bookings ?? 0,
    hours: courtMap[c]?.hours ?? 0,
  }));

  const itemMap = {};
  paidTabs.forEach((tab) => {
    (tab.items ?? []).forEach((item) => {
      const key = item.name;
      if (!itemMap[key]) itemMap[key] = { name: key, quantity: 0, revenue: 0 };
      itemMap[key].quantity += item.quantity ?? 1;
      itemMap[key].revenue += (item.price ?? 0) * (item.quantity ?? 1);
    });
  });
  const topItems = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).slice(0, 8);

  const hourMap = {};
  allReservations.forEach((r) => {
    if (!r.timeSlot) return;
    const hour = parseInt(r.timeSlot.split(':')[0], 10);
    hourMap[hour] = (hourMap[hour] ?? 0) + 1;
  });
  const peakHours = Array.from({ length: 15 }, (_, i) => {
    const hour = 9 + i;
    return { hour, label: `${hour > 12 ? hour - 12 : hour}${hour >= 12 ? 'PM' : 'AM'}`, count: hourMap[hour] ?? 0 };
  });

  const statusBreakdown = ['pending', 'confirmed', 'cancelled', 'completed'].map((status) => ({
    status,
    count: allReservations.filter((r) => r.status === status).length,
  }));

  return {
    period,
    dateRange: { start: toDateStr(start), end: toDateStr(end) },
    reservations: reservationStats,
    billing: {
      totalRevenue: totalBillingRevenue,
      reservationRevenue: totalReservationRevenue,
      combinedRevenue: totalBillingRevenue + totalReservationRevenue,
      paidTabs: paidTabs.length,
      avgPerTab,
    },
    players: {
      total: totalPlayers,
      active: matches.reduce((set, m) => {
        [...(m.team1 ?? []), ...(m.team2 ?? [])].forEach((id) => set.add(String(id)));
        return set;
      }, new Set()).size,
    },
    queue: { matchesPlayed: matches.length },
    revenueByDay,
    courtUtilization,
    topItems,
    peakHours,
    statusBreakdown,
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/analytics/summary?period=today|week|month|year
 *
 * Returns:
 * {
 *   period, dateRange: { start, end },
 *   reservations: { total, confirmed, pending, cancelled, completed },
 *   billing:       { totalRevenue, paidTabs, avgPerTab },
 *   players:       { total, active },
 *   queue:         { matchesPlayed },
 *   revenueByDay:  [{ date, reservationRevenue, billingRevenue, total }],
 *   courtUtilization: [{ court, bookings, hours }],
 *   topItems:      [{ name, quantity, revenue }],
 *   peakHours:     [{ hour, count }],
 *   statusBreakdown: [{ status, count }],
 * }
 */
router.get('/summary', async (req, res) => {
  try {
    const period = req.query.period ?? 'week';
    const summary = await buildSummary(req.courtId, period);
    res.json(summary);
  } catch (err) {
    console.error('[analytics]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/ask', async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { question = '', period = 'week' } = req.body || {};
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'question is required' });
    }

    const allowed = await consumeAnalyticsAskQuota(req.courtId);
    if (!allowed) {
      return res.status(429).json({ error: `You've used your ${DAILY_AI_LIMIT} daily AI queries. Try again tomorrow.` });
    }

    const dataUsed = await buildSummary(req.courtId, period);
    try {
      const answer = await generateAIText({
        maxTokens: 260,
        system: "You are an analytics assistant for PlayKou court managers in the Philippines. You receive a question and structured analytics data (JSON) for their court. Answer the question directly using the data provided. Rules: Be specific: cite numbers, dates, percentages. If the data doesn't answer the question, say so clearly. Keep answers under 120 words. Taglish questions are fine - answer in plain English. Never suggest features that don't exist in the platform.",
        prompt: `Question: ${question}\n\nAnalytics data:\n${JSON.stringify(dataUsed)}`,
      });
      if (!answer) throw new Error('Empty AI answer');
      return res.json({ answer, dataUsed });
    } catch {
      return res.status(200).json({
        answer: 'AI unavailable — check the charts above.',
        dataUsed,
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;