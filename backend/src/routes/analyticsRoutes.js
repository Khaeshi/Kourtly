import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();

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
    const { start, end } = getPeriodRange(period);
    const { Reservation, Tab, Player, Match } = getModels();

    // Reservation fee per confirmed booking (flat rate — adjust as needed)
    const RESERVATION_FEE = 210;

    // ── Parallel queries ──────────────────────────────────────────────────────
    const [
      allReservations,
      paidTabs,
      totalPlayers,
      matches,
    ] = await Promise.all([
      Reservation.find({
        createdAt: { $gte: start, $lte: end },
      }).lean(),

      Tab.find({
        status:    'paid',
        updatedAt: { $gte: start, $lte: end },
      }).lean(),

      Player.countDocuments(),

      Match.find({
        status:    'done',
        updatedAt: { $gte: start, $lte: end },
      }).lean(),
    ]);

    // ── Reservation stats ─────────────────────────────────────────────────────
    const reservationStats = {
      total:     allReservations.length,
      confirmed: allReservations.filter(r => r.status === 'confirmed').length,
      pending:   allReservations.filter(r => r.status === 'pending').length,
      cancelled: allReservations.filter(r => r.status === 'cancelled').length,
      completed: allReservations.filter(r => r.status === 'completed').length,
    };

    // Reservation revenue = confirmed + completed × fee
    const confirmedReservations = allReservations.filter(
      r => r.status === 'confirmed' || r.status === 'completed'
    );
    const totalReservationRevenue = confirmedReservations.length * RESERVATION_FEE;

    // ── Billing stats ─────────────────────────────────────────────────────────
    const totalBillingRevenue = paidTabs.reduce((sum, t) => sum + (t.total ?? 0), 0);
    const avgPerTab = paidTabs.length > 0
      ? Math.round(totalBillingRevenue / paidTabs.length)
      : 0;

    // ── Revenue by day ────────────────────────────────────────────────────────
    const dateList = buildDateRange(start, end);

    // Map reservation revenue per date
    const resByDate = {};
    confirmedReservations.forEach(r => {
      const d = r.date; // already YYYY-MM-DD string
      resByDate[d] = (resByDate[d] ?? 0) + RESERVATION_FEE;
    });

    // Map billing revenue per date (use updatedAt date)
    const billingByDate = {};
    paidTabs.forEach(t => {
      const d = toDateStr(new Date(t.updatedAt));
      billingByDate[d] = (billingByDate[d] ?? 0) + (t.total ?? 0);
    });

    const revenueByDay = dateList.map(date => ({
      date,
      reservationRevenue: resByDate[date]  ?? 0,
      billingRevenue:     billingByDate[date] ?? 0,
      total:              (resByDate[date] ?? 0) + (billingByDate[date] ?? 0),
    }));

    // ── Court utilization ─────────────────────────────────────────────────────
    const courtMap = {};
    confirmedReservations.forEach(r => {
      const c = r.court;
      if (!courtMap[c]) courtMap[c] = { bookings: 0, hours: 0 };
      courtMap[c].bookings++;
      courtMap[c].hours += r.duration ?? 1;
    });

    const courtUtilization = [1, 2, 3, 4].map(c => ({
      court:    c,
      bookings: courtMap[c]?.bookings ?? 0,
      hours:    courtMap[c]?.hours    ?? 0,
    }));

    // ── Top billing items ─────────────────────────────────────────────────────
    const itemMap = {};
    paidTabs.forEach(tab => {
      (tab.items ?? []).forEach(item => {
        const key = item.name;
        if (!itemMap[key]) itemMap[key] = { name: key, quantity: 0, revenue: 0 };
        itemMap[key].quantity += item.quantity ?? 1;
        itemMap[key].revenue  += (item.price ?? 0) * (item.quantity ?? 1);
      });
    });

    const topItems = Object.values(itemMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    // ── Peak booking hours ────────────────────────────────────────────────────
    const hourMap = {};
    allReservations.forEach(r => {
      if (!r.timeSlot) return;
      const hour = parseInt(r.timeSlot.split(':')[0], 10);
      hourMap[hour] = (hourMap[hour] ?? 0) + 1;
    });

    const peakHours = Array.from({ length: 15 }, (_, i) => {
      const hour = 9 + i; // 9am–11pm
      return { hour, label: `${hour > 12 ? hour - 12 : hour}${hour >= 12 ? 'PM' : 'AM'}`, count: hourMap[hour] ?? 0 };
    });

    // ── Status breakdown ──────────────────────────────────────────────────────
    const statusBreakdown = ['pending', 'confirmed', 'cancelled', 'completed'].map(status => ({
      status,
      count: allReservations.filter(r => r.status === status).length,
    }));

    // ── Response ──────────────────────────────────────────────────────────────
    res.json({
      period,
      dateRange: { start: toDateStr(start), end: toDateStr(end) },
      reservations: reservationStats,
      billing: {
        totalRevenue:        totalBillingRevenue,
        reservationRevenue:  totalReservationRevenue,
        combinedRevenue:     totalBillingRevenue + totalReservationRevenue,
        paidTabs:            paidTabs.length,
        avgPerTab,
      },
      players: {
        total:  totalPlayers,
        active: matches.reduce((set, m) => {
          [...(m.team1 ?? []), ...(m.team2 ?? [])].forEach(id => set.add(String(id)));
          return set;
        }, new Set()).size,
      },
      queue: {
        matchesPlayed: matches.length,
      },
      revenueByDay,
      courtUtilization,
      topItems,
      peakHours,
      statusBreakdown,
    });
  } catch (err) {
    console.error('[analytics]', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;