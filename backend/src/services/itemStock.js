import mongoose from 'mongoose';
import StockMovement from '../models/StockMovement.js';

function getTimeZoneParts(date, timeZone, includeTime = false) {
  const options = {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(includeTime ? {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    } : {}),
  };
  return Object.fromEntries(new Intl.DateTimeFormat('en-US', options)
    .formatToParts(date)
    .filter(part => part.type !== 'literal')
    .map(part => [part.type, part.value]));
}

function dateKey(parts) {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function objectId(value) {
  return value instanceof mongoose.Types.ObjectId
    ? value
    : new mongoose.Types.ObjectId(String(value));
}

function addCalendarDay(date) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function localDateTimeToUtc(date, timeZone) {
  const [year, month, day] = date.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day);
  let guess = target;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = getTimeZoneParts(new Date(guess), timeZone, true);
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

export function getCourtDayRange(now = new Date(), timeZone = 'Asia/Manila') {
  const date = dateKey(getTimeZoneParts(now, timeZone));
  const nextDate = addCalendarDay(date);
  return {
    date,
    start: localDateTimeToUtc(date, timeZone),
    end: localDateTimeToUtc(nextDate, timeZone),
  };
}

async function getMovementTotals(courtId, itemIds, start, end, session) {
  if (!itemIds.length) return new Map();
  let aggregation = StockMovement.aggregate([
    {
      $match: {
        courtId: objectId(courtId),
        itemId: { $in: itemIds },
        type: { $in: ['sale', 'void'] },
          $or: [
            { type: 'sale', createdAt: { $gte: start, $lt: end } },
            {
              type: 'void',
              $or: [
                { originalSaleAt: { $gte: start, $lt: end } },
                { originalSaleAt: null, createdAt: { $gte: start, $lt: end } },
              ],
            },
          ],
      },
    },
    {
      $group: {
        _id: '$itemId',
        soldToday: {
          $sum: {
            $multiply: [{ $ifNull: ['$soldQuantityDelta', '$quantityDelta'] }, -1],
          },
        },
        salesToday: {
          $sum: {
            $multiply: [
              {
                $multiply: [
                  { $ifNull: ['$soldQuantityDelta', '$quantityDelta'] },
                  '$unitPrice',
                ],
              },
              -1,
            ],
          },
        },
      },
    },
  ]);
  if (session) aggregation = aggregation.session(session);
  const rows = await aggregation;
  return new Map(rows.map(row => [String(row._id), {
    soldToday: Math.round(row.soldToday),
    salesToday: Math.round(row.salesToday * 100) / 100,
  }]));
}

export async function enrichItemsWithStock(items, courtId, now, timeZone) {
  const trackedItems = items.filter(item => item.trackStock);
  const range = getCourtDayRange(now, timeZone);
  const movementTotals = await getMovementTotals(
    courtId,
    trackedItems.map(item => item._id),
    range.start,
    range.end
  );

  return items.map(item => {
    const tracked = item.trackStock === true;
    const totals = movementTotals.get(String(item._id)) ?? { soldToday: 0, salesToday: 0 };
    const stockOnHand = Number(item.stockOnHand ?? 0);
    return {
      ...item,
      trackStock: tracked,
      stockOnHand,
      lowStockThreshold: Number(item.lowStockThreshold ?? 0),
      note: item.note ?? '',
      soldToday: tracked ? totals.soldToday : 0,
      leftNow: tracked ? stockOnHand : null,
      isLowStock: tracked && stockOnHand <= Number(item.lowStockThreshold ?? 0),
    };
  });
}

export async function getCourtSalesToday(courtId, start, end, session) {
  let aggregation = StockMovement.aggregate([
    {
      $match: {
        courtId: objectId(courtId),
        type: { $in: ['sale', 'void'] },
        $or: [
          { type: 'sale', createdAt: { $gte: start, $lt: end } },
          {
            type: 'void',
            $or: [
              { originalSaleAt: { $gte: start, $lt: end } },
              { originalSaleAt: null, createdAt: { $gte: start, $lt: end } },
            ],
          },
        ],
      },
    },
    {
      $group: {
        _id: null,
        unitsSoldToday: {
          $sum: {
            $multiply: [{ $ifNull: ['$soldQuantityDelta', '$quantityDelta'] }, -1],
          },
        },
        salesToday: {
          $sum: {
            $multiply: [
              {
                $multiply: [
                  { $ifNull: ['$soldQuantityDelta', '$quantityDelta'] },
                  '$unitPrice',
                ],
              },
              -1,
            ],
          },
        },
      },
    },
  ]);
  if (session) aggregation = aggregation.session(session);
  const [row] = await aggregation;
  return {
    unitsSoldToday: Math.round(row?.unitsSoldToday ?? 0),
    salesToday: Math.round((row?.salesToday ?? 0) * 100) / 100,
  };
}
