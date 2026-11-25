import crypto from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import Item from '../models/Item.js';
import StockCount from '../models/StockCount.js';
import StockMovement from '../models/StockMovement.js';
import { emitCourtEvent } from '../lib/emitCourtEvent.js';
import { MAX_STOCK_COUNT_ITEMS, MAX_STOCK_QUANTITY } from '../lib/stockLimits.js';
import {
  enrichItemsWithStock,
  getCourtDayRange,
  getCourtSalesToday,
} from '../services/itemStock.js';

const router = express.Router();
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

class StockRouteError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function routeError(res, error) {
  const status = error.status
    ?? (error.name === 'ValidationError' || error.name === 'CastError' ? 400 : 500);
  res.status(status).json({ error: error.message });
}

function parseIdempotencyKey(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 128) {
    throw new StockRouteError(400, 'A valid idempotencyKey is required.');
  }
  return value.trim();
}

function parseNote(value, required = true) {
  if (typeof value !== 'string') {
    if (required) throw new StockRouteError(400, 'A note is required.');
    return '';
  }
  const note = value.trim();
  if (required && !note) throw new StockRouteError(400, 'A note is required.');
  if (note.length > 500) throw new StockRouteError(400, 'A note cannot exceed 500 characters.');
  return note;
}

function parseNonNegativeInteger(value, fieldName) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > MAX_STOCK_QUANTITY) {
    throw new StockRouteError(
      400,
      `${fieldName} must be a non-negative integer no greater than ${MAX_STOCK_QUANTITY}.`
    );
  }
  return number;
}

function actorId(req) {
  const actor = req.user?._id ?? req.user?.email;
  if (!actor) throw new StockRouteError(401, 'Authenticated user context is unavailable.');
  return String(actor);
}

function requestHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function movementResponse(movement) {
  const row = movement.toObject ? movement.toObject() : movement;
  return {
    _id: String(row._id),
    itemId: String(row.itemId),
    type: row.type,
    quantityDelta: row.quantityDelta,
    balanceAfter: row.balanceAfter,
    unitPrice: row.unitPrice,
    note: row.note,
    tabType: row.tabType ?? null,
    tabId: row.tabId ? String(row.tabId) : null,
    tabLineId: row.tabLineId ? String(row.tabLineId) : null,
    actorId: row.actorId,
    idempotencyKey: row.idempotencyKey,
    originalSaleAt: row.originalSaleAt ?? null,
    ...(row.stockWarning ? {
      stockWarning: {
        itemId: String(row.stockWarning.itemId),
        shortfall: row.stockWarning.shortfall,
      },
    } : {}),
    createdAt: row.createdAt,
  };
}

function stockCountResponse(count) {
  if (!count) return null;
  const row = count.toObject ? count.toObject() : count;
  return {
    countId: String(row._id),
    countedAt: row.countedAt,
    timezone: row.timezone,
    salesToday: row.salesToday,
    unitsSoldToday: row.unitsSoldToday,
    itemsMatched: row.itemsMatched,
    itemsShort: row.itemsShort,
    itemsOver: row.itemsOver,
    items: row.items.map(item => ({
      itemId: String(item.itemId),
      name: item.name,
      expectedQuantity: item.expectedQuantity,
      countedQuantity: item.countedQuantity,
      difference: item.difference,
      note: item.note,
      movementId: item.movementId ? String(item.movementId) : null,
    })),
  };
}

async function findExistingMovement(courtId, idempotencyKey, hash, session) {
  let query = StockMovement.findOne({ courtId, idempotencyKey });
  if (session) query = query.session(session);
  const movement = await query.lean();
  if (!movement) return null;
  if (movement.requestHash !== hash) {
    throw new StockRouteError(409, 'Idempotency key was already used with a different request.');
  }
  return movement;
}

async function runStockMovement(req, options) {
  const courtId = req.courtId;
  const key = parseIdempotencyKey(options.idempotencyKey);
  const hash = requestHash({
    itemId: String(options.itemId),
    type: options.type,
    quantityDelta: options.quantityDelta,
    unitPrice: options.unitPrice ?? 0,
    lowStockThreshold: options.lowStockThreshold,
    note: options.note,
  });
  const actor = actorId(req);
  const session = await mongoose.startSession();
  let result;
  let replayed = false;

  try {
    await session.withTransaction(async () => {
      const existing = await findExistingMovement(courtId, key, hash, session);
      if (existing) {
        const item = await Item.findOne({ _id: options.itemId, courtId }).session(session).lean();
        if (!item) throw new StockRouteError(404, 'Item not found.');
        result = { item, movement: existing };
        replayed = true;
        return;
      }

      const isOpening = options.type === 'opening';
      const filter = isOpening
        ? { _id: options.itemId, courtId, trackStock: { $ne: true } }
        : { _id: options.itemId, courtId, trackStock: true };
      if (!isOpening) {
        filter.stockOnHand = {
          $gte: Math.max(0, -options.quantityDelta),
          $lte: MAX_STOCK_QUANTITY - options.quantityDelta,
        };
      }
      const item = await Item.findOneAndUpdate(
        filter,
        isOpening
          ? {
              $set: {
                trackStock: true,
                stockOnHand: options.quantityDelta,
                lowStockThreshold: options.lowStockThreshold,
              },
            }
          : { $inc: { stockOnHand: options.quantityDelta } },
        { new: true, session },
      ).lean();

      if (!item) {
        const existingItem = await Item.findOne({ _id: options.itemId, courtId })
          .select('trackStock')
          .session(session)
          .lean();
        if (!existingItem) throw new StockRouteError(404, 'Item not found.');
        if (isOpening && existingItem.trackStock) {
          throw new StockRouteError(409, 'Stock tracking is already enabled for this item.');
        }
        if (!isOpening && !existingItem.trackStock) {
          throw new StockRouteError(409, 'Stock tracking must be enabled before changing stock.');
        }
        throw new StockRouteError(
          409,
          `The resulting stock balance must stay between 0 and ${MAX_STOCK_QUANTITY}.`
        );
      }

      const [movement] = await StockMovement.create([{
        courtId,
        itemId: item._id,
        type: options.type,
        quantityDelta: options.quantityDelta,
        balanceAfter: item.stockOnHand,
        unitPrice: options.unitPrice ?? 0,
        note: options.note,
        actorId: actor,
        idempotencyKey: key,
        requestHash: hash,
      }], { session });

      result = { item, movement: movement.toObject() };
    });
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await findExistingMovement(courtId, key, hash);
      if (existing) {
        const item = await Item.findOne({ _id: options.itemId, courtId }).lean();
        if (!item) throw new StockRouteError(404, 'Item not found.');
        result = { item, movement: existing };
        replayed = true;
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  } finally {
    await session.endSession();
  }

  const [item] = await enrichItemsWithStock(
    [result.item],
    courtId,
    new Date(),
    req.court?.settings?.timezone || 'Asia/Manila'
  );
  if (!replayed) {
    emitCourtEvent(req, 'items:updated', {
      action: options.action,
      itemId: String(item._id),
      movementId: String(result.movement._id),
      stockOnHand: item.stockOnHand,
      leftNow: item.leftNow,
      isLowStock: item.isLowStock,
    });
  }
  return { item, movement: movementResponse(result.movement) };
}

router.post('/:id/stock/start', async (req, res) => {
  try {
    const openingQuantity = parseNonNegativeInteger(req.body?.openingQuantity, 'openingQuantity');
    const lowStockThreshold = req.body?.lowStockThreshold === undefined
      ? 0
      : parseNonNegativeInteger(req.body.lowStockThreshold, 'lowStockThreshold');
    const note = parseNote(req.body?.note);
    const result = await runStockMovement(req, {
      itemId: req.params.id,
      idempotencyKey: req.body?.idempotencyKey,
      type: 'opening',
      action: 'stock_opening',
      quantityDelta: openingQuantity,
      lowStockThreshold,
      note,
    });
    res.status(200).json(result);
  } catch (error) {
    routeError(res, error);
  }
});

router.post('/:id/stock/restock', async (req, res) => {
  try {
    const quantity = parseNonNegativeInteger(req.body?.quantity, 'quantity');
    if (quantity < 1) throw new StockRouteError(400, 'quantity must be greater than zero.');
    const result = await runStockMovement(req, {
      itemId: req.params.id,
      idempotencyKey: req.body?.idempotencyKey,
      type: 'restock',
      action: 'stock_restocked',
      quantityDelta: quantity,
      note: parseNote(req.body?.note),
    });
    res.json(result);
  } catch (error) {
    routeError(res, error);
  }
});

router.post('/:id/stock/stop', async (req, res) => {
  let session;
  try {
    const key = parseIdempotencyKey(req.body?.idempotencyKey);
    const note = parseNote(req.body?.note);
    const hash = requestHash({ itemId: req.params.id, type: 'stop', note });
    const actor = actorId(req);
    session = await mongoose.startSession();
    let result;
    await session.withTransaction(async () => {
      const existing = await findExistingMovement(req.courtId, key, hash, session);
      if (existing) {
        const item = await Item.findOne({ _id: req.params.id, courtId: req.courtId }).session(session).lean();
        if (!item) throw new StockRouteError(404, 'Item not found.');
        result = { item, movement: existing };
        return;
      }
      const item = await Item.findOneAndUpdate(
        { _id: req.params.id, courtId: req.courtId, trackStock: true },
        { $set: { trackStock: false } },
        { new: true, session },
      ).lean();
      if (!item) throw new StockRouteError(409, 'Stock tracking is not enabled for this item.');
      const [movement] = await StockMovement.create([{
        courtId: req.courtId,
        itemId: item._id,
        type: 'adjustment',
        quantityDelta: 0,
        balanceAfter: item.stockOnHand,
        note,
        actorId: actor,
        idempotencyKey: key,
        requestHash: hash,
      }], { session });
      result = { item, movement: movement.toObject() };
    });
    const [item] = await enrichItemsWithStock([result.item], req.courtId, new Date(), req.court?.settings?.timezone || 'Asia/Manila');
    emitCourtEvent(req, 'items:updated', {
      action: 'stock_stopped',
      itemId: String(item._id),
      leftNow: null,
      isLowStock: false,
    });
    res.json({ item, movement: movementResponse(result.movement) });
  } catch (error) {
    routeError(res, error);
  } finally {
    if (session) await session.endSession();
  }
});

router.post('/:id/stock/adjust', async (req, res) => {
  try {
    const quantityDelta = Number(req.body?.quantityDelta);
    if (!Number.isSafeInteger(quantityDelta) || quantityDelta === 0 ||
        Math.abs(quantityDelta) > MAX_STOCK_QUANTITY) {
      throw new StockRouteError(
        400,
        `quantityDelta must be a non-zero integer between -${MAX_STOCK_QUANTITY} and ${MAX_STOCK_QUANTITY}.`
      );
    }
    const result = await runStockMovement(req, {
      itemId: req.params.id,
      idempotencyKey: req.body?.idempotencyKey,
      type: 'adjustment',
      action: 'stock_adjusted',
      quantityDelta,
      note: parseNote(req.body?.note),
    });
    res.json(result);
  } catch (error) {
    routeError(res, error);
  }
});

router.patch('/:id/note', async (req, res) => {
  try {
    const note = parseNote(req.body?.note, false);
    const item = await Item.findOneAndUpdate(
      { _id: req.params.id, courtId: req.courtId },
      { $set: { note } },
      { new: true, runValidators: true },
    ).lean();
    if (!item) return res.status(404).json({ error: 'Item not found.' });
    const [enrichedItem] = await enrichItemsWithStock(
      [item],
      req.courtId,
      new Date(),
      req.court?.settings?.timezone || 'Asia/Manila'
    );
    emitCourtEvent(req, 'items:updated', {
      action: 'note_updated',
      itemId: String(item._id),
      stockOnHand: enrichedItem.stockOnHand,
      leftNow: enrichedItem.leftNow,
      isLowStock: enrichedItem.isLowStock,
    });
    res.json(enrichedItem);
  } catch (error) {
    routeError(res, error);
  }
});

router.get('/stock/counts/latest', async (req, res) => {
  try {
    const count = await StockCount.findOne({ courtId: req.courtId })
      .sort({ countedAt: -1 })
      .lean();
    res.json(stockCountResponse(count));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/stock/counts', async (req, res) => {
  let session;
  try {
    const idempotencyKey = parseIdempotencyKey(req.body?.idempotencyKey);
    if (!Array.isArray(req.body?.items) || req.body.items.length === 0) {
      throw new StockRouteError(400, 'At least one counted item is required.');
    }
    if (req.body.items.length > MAX_STOCK_COUNT_ITEMS) {
      throw new StockRouteError(
        400,
        `A stock count cannot contain more than ${MAX_STOCK_COUNT_ITEMS} items.`
      );
    }
    const items = req.body.items.map(entry => ({
      itemId: String(entry?.itemId ?? ''),
      countedQuantity: parseNonNegativeInteger(entry?.countedQuantity, 'countedQuantity'),
      note: parseNote(entry?.note, false),
    }));
    if (new Set(items.map(item => item.itemId)).size !== items.length) {
      throw new StockRouteError(400, 'An item may only appear once in a stock count.');
    }
    const hash = requestHash([...items].sort((a, b) => a.itemId.localeCompare(b.itemId)));
    const actor = actorId(req);
    const timezone = req.court?.settings?.timezone || 'Asia/Manila';
    const day = getCourtDayRange(new Date(), timezone);
    session = await mongoose.startSession();
    let count;
    let replayed = false;

    await session.withTransaction(async () => {
      const existing = await StockCount.findOne({ courtId: req.courtId, idempotencyKey })
        .session(session)
        .lean();
      if (existing) {
        if (existing.requestHash !== hash) {
          throw new StockRouteError(409, 'Idempotency key was already used with a different request.');
        }
        count = existing;
        replayed = true;
        return;
      }

      const countItems = [];
      let itemsMatched = 0;
      let itemsShort = 0;
      let itemsOver = 0;

      for (const entry of items) {
        const item = await Item.findOne({
          _id: entry.itemId,
          courtId: req.courtId,
        }).session(session).lean();
        if (!item) throw new StockRouteError(404, 'One or more items were not found.');
        if (!item.trackStock) {
          throw new StockRouteError(409, `${item.name} does not have stock tracking enabled.`);
        }

        const expectedQuantity = Number(item.stockOnHand ?? 0);
        const difference = entry.countedQuantity - expectedQuantity;
        let movementId = null;
        if (difference === 0) {
          itemsMatched += 1;
        } else {
          if (difference < 0) itemsShort += 1;
          else itemsOver += 1;

          const updatedItem = await Item.findOneAndUpdate(
            { _id: item._id, courtId: req.courtId, trackStock: true, stockOnHand: expectedQuantity },
            { $set: { stockOnHand: entry.countedQuantity } },
            { new: true, session },
          ).lean();
          if (!updatedItem) throw new StockRouteError(409, 'Stock changed during the count. Please retry.');

          const movementKey = `${idempotencyKey}:count:${item._id}`;
          const movementHash = requestHash({
            itemId: String(item._id),
            countIdempotencyKey: idempotencyKey,
            countedQuantity: entry.countedQuantity,
          });
          const [movement] = await StockMovement.create([{
            courtId: req.courtId,
            itemId: item._id,
            type: 'count',
            quantityDelta: difference,
            balanceAfter: updatedItem.stockOnHand,
            note: entry.note || 'Stock count',
            actorId: actor,
            idempotencyKey: movementKey,
            requestHash: movementHash,
          }], { session });
          movementId = movement._id;
        }

        countItems.push({
          itemId: item._id,
          name: item.name,
          expectedQuantity,
          countedQuantity: entry.countedQuantity,
          difference,
          note: entry.note,
          movementId,
        });
      }

      const sales = await getCourtSalesToday(req.courtId, day.start, day.end, session);
      const [createdCount] = await StockCount.create([{
        courtId: req.courtId,
        idempotencyKey,
        requestHash: hash,
        timezone,
        salesToday: sales.salesToday,
        unitsSoldToday: sales.unitsSoldToday,
        itemsMatched,
        itemsShort,
        itemsOver,
        actorId: actor,
        items: countItems,
      }], { session });
      count = createdCount.toObject();
    });

    const response = stockCountResponse(count);
    if (!replayed) {
      const currentItems = await Item.find({
        _id: { $in: response.items.map(item => item.itemId) },
        courtId: req.courtId,
      }).lean();
      const enrichedItems = await enrichItemsWithStock(
        currentItems,
        req.courtId,
        new Date(),
        timezone
      );
      const enrichedById = new Map(enrichedItems.map(item => [String(item._id), item]));
      for (const item of response.items) {
        const enrichedItem = enrichedById.get(item.itemId);
        if (!enrichedItem) continue;
        emitCourtEvent(req, 'items:updated', {
          action: 'stock_counted',
          itemId: String(item.itemId),
          movementId: item.movementId ? String(item.movementId) : undefined,
          stockOnHand: enrichedItem.stockOnHand,
          leftNow: enrichedItem.leftNow,
          isLowStock: enrichedItem.isLowStock,
        });
      }
    }
    res.status(201).json(response);
  } catch (error) {
    if (error?.code === 11000 && req.body?.idempotencyKey) {
      try {
        const existing = await StockCount.findOne({
          courtId: req.courtId,
          idempotencyKey: req.body.idempotencyKey,
        }).lean();
        if (existing) {
          if (existing.requestHash !== requestHash([...(req.body.items ?? [])]
            .map(entry => ({
              itemId: String(entry?.itemId ?? ''),
              countedQuantity: Number(entry?.countedQuantity),
              note: typeof entry?.note === 'string' ? entry.note.trim() : '',
            }))
            .sort((a, b) => a.itemId.localeCompare(b.itemId)))) {
            throw new StockRouteError(409, 'Idempotency key was already used with a different request.');
          }
          return res.status(201).json(stockCountResponse(existing));
        }
      } catch (lookupError) {
        return routeError(res, lookupError);
      }
    }
    routeError(res, error);
  } finally {
    if (session) await session.endSession();
  }
});

router.get('/:id/stock/movements', async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE));
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw new StockRouteError(400, 'Invalid item ID.');
    }
    const item = await Item.exists({ _id: req.params.id, courtId: req.courtId });
    if (!item) throw new StockRouteError(404, 'Item not found.');
    const filter = { courtId: req.courtId, itemId: req.params.id };
    const [movements, total] = await Promise.all([
      StockMovement.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      StockMovement.countDocuments(filter),
    ]);
    res.json({
      movements: movements.map(movementResponse),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    routeError(res, error);
  }
});

export default router;
