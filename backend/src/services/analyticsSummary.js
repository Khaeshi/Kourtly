import mongoose from 'mongoose';
import Court from '../models/Court.js';
import Item from '../models/Item.js';
import Reservation from '../models/Reservation.js';
import ReservationTab from '../models/ReservationTab.js';
import ScheduleBlock from '../models/ScheduleBlock.js';
import ScheduleRule from '../models/ScheduleRule.js';
import StockMovement from '../models/StockMovement.js';
import Tab from '../models/Tab.js';
import Match from '../models/Match.js';
import Player from '../models/Player.js';
import { getDayOfWeek, resolveSchedule } from '../utils/scheduleUtils.js';
import { seedDefaultRules } from './scheduleDefaults.js';

const BOOKED_STATUSES = new Set(['confirmed', 'completed']);

function localParts(date, timeZone, includeTime = false) {
  const options = {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : {}),
  };
  return Object.fromEntries(new Intl.DateTimeFormat('en-US', options)
    .formatToParts(date)
    .filter(part => part.type !== 'literal')
    .map(part => [part.type, part.value]));
}

function dateKey(parts) {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(date, amount) {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + amount);
  return result.toISOString().slice(0, 10);
}

function localDateTimeToUtc(date, timeZone) {
  const [year, month, day] = date.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day);
  let guess = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = localParts(new Date(guess), timeZone, true);
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute)
    );
    const difference = target - represented;
    guess += difference;
    if (difference === 0) break;
  }
  return new Date(guess);
}

function monthStart(date) {
  return `${date.slice(0, 7)}-01`;
}

function yearStart(date) {
  return `${date.slice(0, 4)}-01-01`;
}

function periodDateRange(period, today) {
  switch (period) {
    case 'today':
      return { startDate: today, endDate: today };
    case 'week': {
      const startDate = addDays(today, -new Date(`${today}T00:00:00.000Z`).getUTCDay());
      return { startDate, endDate: addDays(startDate, 6) };
    }
    case 'month': {
      const startDate = monthStart(today);
      const nextMonth = new Date(`${startDate}T00:00:00.000Z`);
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
      return { startDate, endDate: addDays(nextMonth.toISOString().slice(0, 10), -1) };
    }
    case 'year': {
      const startDate = yearStart(today);
      return { startDate, endDate: `${today.slice(0, 4)}-12-31` };
    }
    default:
      throw new Error(`Unknown period: ${period}`);
  }
}

function previousDateRange(period, current) {
  switch (period) {
    case 'today': {
      const date = addDays(current.startDate, -1);
      return { startDate: date, endDate: date };
    }
    case 'week':
      return {
        startDate: addDays(current.startDate, -7),
        endDate: addDays(current.endDate, -7),
      };
    case 'month': {
      const previousMonthEnd = addDays(current.startDate, -1);
      return {
        startDate: monthStart(previousMonthEnd),
        endDate: previousMonthEnd,
      };
    }
    case 'year': {
      const year = Number(current.startDate.slice(0, 4)) - 1;
      return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
    }
    default:
      throw new Error(`Unknown period: ${period}`);
  }
}

function utcRange(dateRange, timeZone) {
  return {
    start: localDateTimeToUtc(dateRange.startDate, timeZone),
    end: localDateTimeToUtc(addDays(dateRange.endDate, 1), timeZone),
  };
}

function dateInTimeZone(value, timeZone) {
  return dateKey(localParts(new Date(value), timeZone));
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function reservationPaymentAmount(reservation) {
  if (reservation.paidAmount !== null && reservation.paidAmount !== undefined) {
    return Math.max(0, numeric(reservation.paidAmount));
  }
  return Math.max(0, numeric(reservation.amountPaidOnline));
}

function reservationPaymentDate(reservation) {
  return reservation.paidAt || reservation.providerPaidAt || null;
}

function reservationCounterBalance(tab) {
  const paymentSummary = tab.paymentSummary ?? {};
  if (numeric(paymentSummary.paidOnline) <= 0) return 0;
  return Math.max(
    0,
    numeric(paymentSummary.reservationFee) - numeric(paymentSummary.paidCourtFee)
  );
}

function addItemTotals(map, lines) {
  for (const line of lines ?? []) {
    const name = String(line.name ?? 'Item');
    const itemId = line.item ? String(line.item) : null;
    const key = itemId ?? `name:${name.toLowerCase()}`;
    if (!map.has(key)) map.set(key, { itemId, name, quantity: 0, revenue: 0 });
    const entry = map.get(key);
    const quantity = numeric(line.quantity) || 1;
    entry.quantity += quantity;
    entry.revenue += numeric(line.price) * quantity;
  }
}

function revenueChange(current, previous) {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

async function loadPeriodData(courtId, dateRange, timeZone) {
  const range = utcRange(dateRange, timeZone);
  const [paidReservations, paidTabs, paidReservationTabs] = await Promise.all([
    Reservation.find({
      courtId,
      paymentStatus: 'paid',
      $or: [
        { paidAt: { $gte: range.start, $lt: range.end } },
        { providerPaidAt: { $gte: range.start, $lt: range.end } },
      ],
    }).lean(),
    Tab.find({
      courtId,
      status: 'paid',
      updatedAt: { $gte: range.start, $lt: range.end },
    }).lean(),
    ReservationTab.find({
      courtId,
      status: 'paid',
      updatedAt: { $gte: range.start, $lt: range.end },
    }).lean(),
  ]);
  return { paidReservations, paidTabs, paidReservationTabs };
}

function calculateRevenue(data, timeZone) {
  let reservationRevenue = 0;
  let queueTabRevenue = 0;
  let reservationTabItemRevenue = 0;
  let onlinePayments = 0;
  let counterPayments = 0;
  let courtFees = 0;
  const itemTotals = new Map();
  const revenueByDate = new Map();

  const addRevenueForDate = (date, key, amount) => {
    const row = revenueByDate.get(date) ?? { reservationRevenue: 0, billingRevenue: 0 };
    row[key] += amount;
    revenueByDate.set(date, row);
  };

  for (const reservation of data.paidReservations) {
    const amount = reservationPaymentAmount(reservation);
    const paidAt = reservationPaymentDate(reservation);
    if (!paidAt || amount <= 0) continue;

    reservationRevenue += amount;
    const paymentMethod = String(reservation.paymentMethod || reservation.paymentChannel || '').toLowerCase();
    const onlineAmount = numeric(reservation.amountPaidOnline);
    if (paymentMethod === 'counter') {
      counterPayments += amount;
      courtFees += Math.min(amount, numeric(reservation.reservationFeeAmount) || amount);
    } else {
      onlinePayments += amount;
      courtFees += Math.min(
        numeric(reservation.reservationFeeAmount),
        Math.max(0, onlineAmount - numeric(reservation.maintenanceFeeAmount))
      );
    }
    addRevenueForDate(dateInTimeZone(paidAt, timeZone), 'reservationRevenue', amount);
  }

  for (const tab of data.paidTabs) {
    const amount = numeric(tab.total);
    queueTabRevenue += amount;
    counterPayments += amount;
    addItemTotals(itemTotals, tab.items);
    addRevenueForDate(dateInTimeZone(tab.updatedAt, timeZone), 'billingRevenue', amount);
  }

  for (const tab of data.paidReservationTabs) {
    const itemsAmount = (tab.items ?? []).reduce(
      (sum, line) => sum + numeric(line.price) * (numeric(line.quantity) || 1),
      0
    );
    const counterCourtFee = reservationCounterBalance(tab);
    reservationTabItemRevenue += itemsAmount;
    counterPayments += itemsAmount + counterCourtFee;
    courtFees += counterCourtFee;
    addItemTotals(itemTotals, tab.items);
    addRevenueForDate(dateInTimeZone(tab.updatedAt, timeZone), 'billingRevenue', itemsAmount);
    addRevenueForDate(dateInTimeZone(tab.updatedAt, timeZone), 'reservationRevenue', counterCourtFee);
  }

  return {
    reservationRevenue,
    billingRevenue: queueTabRevenue + reservationTabItemRevenue,
    combinedRevenue: reservationRevenue + queueTabRevenue + reservationTabItemRevenue +
      data.paidReservationTabs.reduce((sum, tab) => {
        return sum + reservationCounterBalance(tab);
      }, 0),
    paidTabs: data.paidTabs.length + data.paidReservationTabs.length,
    onlinePayments,
    counterPayments,
    courtFees,
    itemsRevenue: queueTabRevenue + reservationTabItemRevenue,
    itemTotals,
    revenueByDate,
  };
}

function weekdayHourCounts(reservations) {
  const counts = new Map();
  for (const reservation of reservations) {
    if (!BOOKED_STATUSES.has(reservation.status) || !reservation.timeSlot) continue;
    const hour = Number(reservation.timeSlot.slice(0, 2));
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;
    const weekday = new Date(`${reservation.date}T00:00:00.000Z`).getUTCDay();
    const key = `${weekday}:${hour}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([key, count]) => {
    const [weekday, hour] = key.split(':').map(Number);
    return { weekday, hour, count };
  }).sort((a, b) => a.weekday - b.weekday || a.hour - b.hour);
}

async function todayUtilization(courtId, courtCount, today) {
  await seedDefaultRules(courtId);
  const dayOfWeek = getDayOfWeek(today);
  const [rule, blocks, reservations] = await Promise.all([
    ScheduleRule.findOne({ courtId, dayOfWeek }).lean(),
    ScheduleBlock.find({ courtId, date: today }).lean(),
    Reservation.find({
      courtId,
      date: today,
      status: { $in: [...BOOKED_STATUSES] },
    }).select('court duration').lean(),
  ]);

  const resolved = resolveSchedule(rule, blocks, courtCount);
  const openHours = Object.values(resolved.perCourt).reduce((sum, value) =>
    sum + resolved.baseSlots.filter(slot => !value.adminBlockedSlots.includes(slot)).length, 0);
  const bookedHours = reservations.reduce((sum, reservation) => sum + numeric(reservation.duration || 1), 0);
  return {
    bookedHours,
    openHours,
    bookedShare: openHours === 0 ? 0 : Math.round((bookedHours / openHours) * 10000) / 10000,
  };
}

export async function buildAnalyticsSummary(courtId, period, options = {}) {
  const timezone = options.timezone || 'Asia/Manila';
  const courtCount = Math.max(1, Number(options.courtCount) || 4);
  const today = dateKey(localParts(new Date(), timezone));
  const currentRange = periodDateRange(period, today);
  const previousRange = previousDateRange(period, currentRange);
  const currentUtc = utcRange(currentRange, timezone);
  const previousUtc = utcRange(previousRange, timezone);
  const combinedStart = previousUtc.start < currentUtc.start ? previousUtc.start : currentUtc.start;
  const combinedEnd = previousUtc.end > currentUtc.end ? previousUtc.end : currentUtc.end;

  const [createdReservations, bookedReservations, paymentReservations, paidTabs, paidReservationTabs,
    totalPlayers, matches, openTabs, unpaidTabs, openReservationTabs, unpaidReservationTabs,
    trackedItems, currentCourt] = await Promise.all([
    Reservation.find({ courtId, createdAt: { $gte: currentUtc.start, $lt: currentUtc.end } }).lean(),
    Reservation.find({
      courtId,
      date: { $gte: currentRange.startDate, $lte: currentRange.endDate },
    }).select('court date timeSlot duration status').lean(),
    Reservation.find({
      courtId,
      paymentStatus: 'paid',
      $or: [
        { paidAt: { $gte: combinedStart, $lt: combinedEnd } },
        { providerPaidAt: { $gte: combinedStart, $lt: combinedEnd } },
      ],
    }).lean(),
    Tab.find({
      courtId,
      status: 'paid',
      updatedAt: { $gte: combinedStart, $lt: combinedEnd },
    }).lean(),
    ReservationTab.find({
      courtId,
      status: 'paid',
      updatedAt: { $gte: combinedStart, $lt: combinedEnd },
    }).lean(),
    Player.countDocuments({ courtId }),
    Match.find({
      courtId,
      status: 'done',
      updatedAt: { $gte: currentUtc.start, $lt: currentUtc.end },
    }).lean(),
    Tab.find({ courtId, status: 'open' }).select('total').lean(),
    Tab.find({ courtId, status: 'unpaid' }).select('total').lean(),
    ReservationTab.find({ courtId, status: 'open' }).select('total').lean(),
    ReservationTab.find({ courtId, status: 'unpaid' }).select('total').lean(),
    Item.find({ courtId, isActive: true, trackStock: true })
      .select('name stockOnHand lowStockThreshold').lean(),
    Court.findById(courtId).select('settings.monthlyRevenueGoal').lean(),
  ]);

  const currentPayments = {
    paidReservations: paymentReservations.filter(reservation => {
      const paidAt = reservationPaymentDate(reservation);
      return paidAt && paidAt >= currentUtc.start && paidAt < currentUtc.end;
    }),
    paidTabs: paidTabs.filter(tab => tab.updatedAt >= currentUtc.start && tab.updatedAt < currentUtc.end),
    paidReservationTabs: paidReservationTabs.filter(tab =>
      tab.updatedAt >= currentUtc.start && tab.updatedAt < currentUtc.end),
  };
  const previousPayments = {
    paidReservations: paymentReservations.filter(reservation => {
      const paidAt = reservationPaymentDate(reservation);
      return paidAt && paidAt >= previousUtc.start && paidAt < previousUtc.end;
    }),
    paidTabs: paidTabs.filter(tab => tab.updatedAt >= previousUtc.start && tab.updatedAt < previousUtc.end),
    paidReservationTabs: paidReservationTabs.filter(tab =>
      tab.updatedAt >= previousUtc.start && tab.updatedAt < previousUtc.end),
  };
  const revenue = calculateRevenue(currentPayments, timezone);
  const previousRevenue = calculateRevenue(previousPayments, timezone);

  const confirmedReservations = bookedReservations.filter(reservation => BOOKED_STATUSES.has(reservation.status));
  const courtMap = new Map();
  for (const reservation of confirmedReservations) {
    const entry = courtMap.get(reservation.court) ?? { bookings: 0, hours: 0 };
    entry.bookings += 1;
    entry.hours += numeric(reservation.duration || 1);
    courtMap.set(reservation.court, entry);
  }
  const dateList = [];
  for (let date = currentRange.startDate; date <= currentRange.endDate; date = addDays(date, 1)) {
    dateList.push(date);
  }
  const revenueByDay = dateList.map(date => {
    const values = revenue.revenueByDate.get(date) ?? { reservationRevenue: 0, billingRevenue: 0 };
    return { date, ...values, total: values.reservationRevenue + values.billingRevenue };
  });
  const paymentRevenue = revenue.reservationRevenue + revenue.billingRevenue +
    currentPayments.paidReservationTabs.reduce((sum, tab) => {
      return sum + reservationCounterBalance(tab);
    }, 0);
  const reservationStats = {
    total: createdReservations.length,
    confirmed: createdReservations.filter(reservation => reservation.status === 'confirmed').length,
    pending: createdReservations.filter(reservation =>
      ['pending', 'pending_admin', 'approved_waiting_payment', 'payment_processing', 'payment_received'].includes(reservation.status)).length,
    cancelled: createdReservations.filter(reservation => reservation.status === 'cancelled').length,
    completed: createdReservations.filter(reservation => reservation.status === 'completed').length,
  };
  const itemTotals = revenue.itemTotals;
  const topItems = [...itemTotals.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);
  const hourMap = new Map();
  for (const reservation of confirmedReservations) {
    if (!reservation.timeSlot) continue;
    const hour = Number(reservation.timeSlot.slice(0, 2));
    if (Number.isInteger(hour)) hourMap.set(hour, (hourMap.get(hour) ?? 0) + 1);
  }
  const peakHours = Array.from({ length: 15 }, (_, index) => {
    const hour = index + 9;
    return {
      hour,
      label: `${hour > 12 ? hour - 12 : hour}${hour >= 12 ? 'PM' : 'AM'}`,
      count: hourMap.get(hour) ?? 0,
    };
  });

  const todayUtc = utcRange({ startDate: today, endDate: today }, timezone);
  const [utilization, todaySales] = await Promise.all([
    todayUtilization(courtId, courtCount, today),
    StockMovement.aggregate([
      {
        $match: {
          courtId: new mongoose.Types.ObjectId(String(courtId)),
          type: { $in: ['sale', 'void'] },
          createdAt: { $gte: todayUtc.start, $lt: todayUtc.end },
        },
      },
      {
        $group: {
          _id: '$itemId',
          sold: { $sum: { $multiply: ['$quantityDelta', -1] } },
        },
      },
    ]),
  ]);
  const soldByItem = new Map(todaySales.map(row => [String(row._id), numeric(row.sold)]));
  const lowStockItems = trackedItems
    .filter(item => numeric(item.stockOnHand) <= numeric(item.lowStockThreshold))
    .map(item => ({
      itemId: String(item._id),
      name: item.name,
      stockOnHand: numeric(item.stockOnHand),
      lowStockThreshold: numeric(item.lowStockThreshold),
      soldToday: soldByItem.get(String(item._id)) ?? 0,
    }))
    .sort((a, b) => a.stockOnHand - b.stockOnHand);

  const countTotal = rows => rows.reduce((sum, row) => sum + numeric(row.total), 0);
  const itemCountTotal = currentPayments.paidTabs.reduce((sum, tab) =>
    sum + (tab.items ?? []).reduce((value, line) => value + numeric(line.price) * (numeric(line.quantity) || 1), 0), 0)
    + currentPayments.paidReservationTabs.reduce((sum, tab) =>
      sum + (tab.items ?? []).reduce((value, line) => value + numeric(line.price) * (numeric(line.quantity) || 1), 0), 0);
  const courtFeeCounter = currentPayments.paidReservationTabs.reduce((sum, tab) => {
    return sum + reservationCounterBalance(tab);
  }, 0);
  const queueCounter = currentPayments.paidTabs.reduce((sum, tab) => sum + numeric(tab.total), 0);
  const reservationCounterItems = currentPayments.paidReservationTabs.reduce((sum, tab) =>
    sum + (tab.items ?? []).reduce((value, line) => value + numeric(line.price) * (numeric(line.quantity) || 1), 0), 0);
  const onlinePayments = currentPayments.paidReservations.reduce((sum, reservation) => {
    const method = String(reservation.paymentMethod || reservation.paymentChannel || '').toLowerCase();
    return method === 'counter' ? sum : sum + reservationPaymentAmount(reservation);
  }, 0);
  const counterReservationPayments = currentPayments.paidReservations.reduce((sum, reservation) => {
    const method = String(reservation.paymentMethod || reservation.paymentChannel || '').toLowerCase();
    return method === 'counter' ? sum + reservationPaymentAmount(reservation) : sum;
  }, 0);
  const billingTotalRevenue = currentPayments.paidTabs.reduce((sum, tab) => sum + numeric(tab.total), 0)
    + reservationCounterItems;
  const allPaidTabsCount = currentPayments.paidTabs.length + currentPayments.paidReservationTabs.length;
  const lowStockIds = lowStockItems.map(item => item.itemId);
  const monthlyGoal = numeric(currentCourt?.settings?.monthlyRevenueGoal);

  return {
    period,
    timezone,
    dateRange: { start: currentRange.startDate, end: currentRange.endDate },
    comparison: {
      dateRange: { start: previousRange.startDate, end: previousRange.endDate },
      revenue: previousRevenue.combinedRevenue,
      changePercent: revenueChange(paymentRevenue, previousRevenue.combinedRevenue),
    },
    reservations: reservationStats,
    billing: {
      totalRevenue: billingTotalRevenue,
      reservationRevenue: revenue.reservationRevenue + courtFeeCounter,
      combinedRevenue: paymentRevenue,
      paidTabs: allPaidTabsCount,
      avgPerTab: allPaidTabsCount ? Math.round(billingTotalRevenue / allPaidTabsCount) : 0,
    },
    tabs: {
      open: {
        count: openTabs.length + openReservationTabs.length,
        total: countTotal(openTabs) + countTotal(openReservationTabs),
      },
      unpaid: {
        count: unpaidTabs.length + unpaidReservationTabs.length,
        total: countTotal(unpaidTabs) + countTotal(unpaidReservationTabs),
      },
    },
    payments: {
      online: onlinePayments,
      counter: counterPaymentsForSummary(
        queueCounter,
        reservationCounterItems,
        courtFeeCounter,
        counterReservationPayments
      ),
      courtFees: revenue.courtFees,
      items: itemCountTotal,
    },
    players: {
      total: totalPlayers,
      active: matches.reduce((set, match) => {
        [...(match.team1 ?? []), ...(match.team2 ?? [])].forEach(id => set.add(String(id)));
        return set;
      }, new Set()).size,
    },
    queue: { matchesPlayed: matches.length },
    revenueByDay,
    courtUtilization: Array.from({ length: courtCount }, (_, index) => {
      const court = index + 1;
      const value = courtMap.get(court) ?? { bookings: 0, hours: 0 };
      return { court, ...value };
    }),
    topItems,
    peakHours,
    statusBreakdown: ['pending', 'confirmed', 'cancelled', 'completed'].map(status => ({
      status,
      count: createdReservations.filter(reservation => reservation.status === status).length,
    })),
    bookingsByWeekdayHour: weekdayHourCounts(bookedReservations),
    todayUtilization: utilization,
    lowStockItems: lowStockIds.length ? lowStockItems : [],
    monthlyRevenueGoal: monthlyGoal,
  };
}

function counterPaymentsForSummary(queueItems, reservationItems, courtFees, counterReservations) {
  return queueItems + reservationItems + courtFees + counterReservations;
}
