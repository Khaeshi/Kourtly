import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Item from '../models/Item.js';
import StockMovement from '../models/StockMovement.js';
import { emitCourtEvent } from '../lib/emitCourtEvent.js';
import { MAX_STOCK_QUANTITY } from '../lib/stockLimits.js';

function hashRequest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function asId(value) {
  return value == null ? null : new mongoose.Types.ObjectId(String(value));
}

export async function recordBillingStockMovement({
  req,
  session,
  itemId,
  type,
  quantity,
  unitPrice,
  note,
  tabType,
  tabId,
  tabLineId,
  chargeGroupId = null,
}) {
  if (!itemId || !mongoose.Types.ObjectId.isValid(String(itemId))) return null;

  let itemKey = asId(itemId);
  let groupKey = asId(chargeGroupId);
  let lineKey = asId(tabLineId);
  let tabKey = asId(tabId);
  let originalSaleAt = null;
  let soldQuantityDelta;
  if (type === 'sale' &&
      (!Number.isInteger(quantity) || quantity <= 0 ||
       !Number.isFinite(unitPrice) || unitPrice < 0)) {
    const tracked = await Item.exists({
      _id: itemKey, courtId: req.courtId, trackStock: true,
    }).session(session);
    if (!tracked) return null;
    const error = new Error('Tracked item charges require a positive integer quantity and a valid price.');
    error.status = 400;
    throw error;
  }
  if (type === 'void') {
    const saleKey = groupKey
      ? `billing:sale:${tabType}:group:${groupKey}`
      : `billing:sale:${tabType}:line:${lineKey}`;
    const sale = await StockMovement.findOne({
      courtId: req.courtId,
      idempotencyKey: saleKey,
    }).session(session).lean();
    if (!sale) return null;
    itemKey = sale.itemId;
    quantity = Math.abs(sale.quantityDelta);
    soldQuantityDelta = Math.abs(sale.soldQuantityDelta ?? sale.quantityDelta);
    unitPrice = sale.unitPrice;
    originalSaleAt = sale.createdAt;
    groupKey = sale.chargeGroupId ?? null;
    lineKey = sale.tabLineId ?? lineKey;
    tabKey = sale.tabId ?? tabKey;
  }

  const idempotencyKey = groupKey
    ? `billing:${type}:${tabType}:group:${groupKey}`
    : `billing:${type}:${tabType}:line:${lineKey}`;
  const request = {
    itemId: String(itemKey),
    type,
    quantity,
    unitPrice,
    tabType,
    tabId: String(tabKey),
    ...(groupKey ? { chargeGroupId: String(groupKey) } : { tabLineId: String(lineKey) }),
  };
  const requestHash = hashRequest(request);
  const existing = await StockMovement.findOne({
    courtId: req.courtId,
    idempotencyKey,
  }).session(session).lean();

  if (existing) {
    if (existing.requestHash !== requestHash) {
      const error = new Error('Stock movement idempotency conflict.');
      error.status = 409;
      throw error;
    }
    return null;
  }

  let delta;
  let stockWarning;
  let item;
  if (type === 'sale') {
    const currentItem = await Item.findOne({
      _id: itemKey, courtId: req.courtId, trackStock: true,
    }).session(session).lean();
    if (!currentItem) return null;
    const currentBalance = Number(currentItem.stockOnHand ?? 0);
    if (!Number.isSafeInteger(currentBalance) || currentBalance > MAX_STOCK_QUANTITY) {
      const error = new Error('Current stock balance is outside the supported range.');
      error.status = 409;
      throw error;
    }
    const available = Math.max(0, currentBalance);
    const consumed = Math.min(quantity, available);
    delta = -consumed;
    soldQuantityDelta = -quantity;
    if (quantity > available) {
      stockWarning = {
        itemId: String(itemKey),
        shortfall: quantity - available,
      };
    }
    item = await Item.findOneAndUpdate(
      {
        _id: itemKey,
        courtId: req.courtId,
        trackStock: true,
        stockOnHand: currentItem.stockOnHand ?? 0,
      },
      { $set: { stockOnHand: available - consumed } },
      { returnDocument: 'after', session },
    ).lean();
    if (!item) {
      const error = new Error('Stock changed during billing. Please retry.');
      error.status = 409;
      throw error;
    }
  } else {
    delta = quantity;
    item = await Item.findOneAndUpdate(
      {
        _id: itemKey,
        courtId: req.courtId,
        trackStock: true,
        stockOnHand: { $gte: 0, $lte: MAX_STOCK_QUANTITY - delta },
      },
      { $inc: { stockOnHand: delta } },
      { returnDocument: 'after', session },
    ).lean();
    if (!item) {
      const tracked = await Item.exists({
        _id: itemKey, courtId: req.courtId, trackStock: true,
      }).session(session);
      if (!tracked) return null;
      const error = new Error('Reversing this charge would exceed the supported stock balance.');
      error.status = 409;
      throw error;
    }
  }

  const actor = req.user?._id ?? req.user?.email;
  if (!actor) {
    const error = new Error('Authenticated user context is unavailable.');
    error.status = 401;
    throw error;
  }

  const [movement] = await StockMovement.create([{
    courtId: req.courtId,
    itemId: itemKey,
    type,
    quantityDelta: delta,
    ...(soldQuantityDelta !== undefined ? { soldQuantityDelta } : {}),
    balanceAfter: item.stockOnHand,
    ...(stockWarning ? {
      stockWarning: {
        itemId: itemKey,
        shortfall: stockWarning.shortfall,
      },
    } : {}),
    unitPrice,
    note,
    tabType,
    tabId: tabKey,
    tabLineId: lineKey,
    chargeGroupId: groupKey,
    actorId: String(actor),
    idempotencyKey,
    requestHash,
    originalSaleAt,
  }], { session });

  return {
    itemId: itemKey,
    movementId: movement._id,
    type,
    stockOnHand: item.stockOnHand,
    lowStockThreshold: item.lowStockThreshold,
    ...(stockWarning ? { stockWarning } : {}),
  };
}

export async function removeChargeGroup({ model, courtId, chargeGroupId, session }) {
  const tabs = await model.find({
    courtId,
    'items.chargeGroupId': chargeGroupId,
  }).session(session);
  const removed = [];

  for (const tab of tabs) {
    const groupLines = tab.items.filter(line =>
      String(line.chargeGroupId) === String(chargeGroupId)
    );
    if (!groupLines.length) continue;

    const removedTotal = groupLines.reduce(
      (total, line) => total + line.price * line.quantity,
      0
    );
    tab.items = tab.items.filter(line =>
      String(line.chargeGroupId) !== String(chargeGroupId)
    );
    tab.total -= removedTotal;
    await tab.save({ session });
    removed.push({ tab, lines: groupLines });
  }

  return removed;
}

export function emitBillingStockUpdates(req, changes) {
  const groupedChanges = new Map();
  for (const change of changes) {
    const key = String(change.itemId);
    const itemChanges = groupedChanges.get(key) ?? [];
    itemChanges.push(change);
    groupedChanges.set(key, itemChanges);
  }

  for (const [itemId, itemChanges] of groupedChanges) {
    const latest = itemChanges[itemChanges.length - 1];
    const types = [...new Set(itemChanges.map(change => change.type))];
    const shortfall = itemChanges.reduce(
      (total, change) => total + (change.stockWarning?.shortfall ?? 0),
      0
    );
    emitCourtEvent(req, 'items:updated', {
      action: types.length === 1 ? `stock_${types[0]}` : 'stock_changed',
      itemId,
      stockOnHand: latest.stockOnHand,
      leftNow: latest.stockOnHand,
      isLowStock: latest.stockOnHand <= latest.lowStockThreshold,
      movementIds: itemChanges.map(change => String(change.movementId)),
      ...(shortfall > 0 ? {
        stockWarning: { itemId, shortfall },
      } : {}),
    });
  }
}

export function withBillingStockWarning(value, changes) {
  const warning = changes.find(change => change.stockWarning)?.stockWarning;
  if (!warning) return value;
  const toObject = row => row?.toObject ? row.toObject() : row;
  return Array.isArray(value)
    ? value.map(row => ({ ...toObject(row), stockWarning: warning }))
    : { ...toObject(value), stockWarning: warning };
}

export async function getBillingStockWarning({
  courtId,
  tabType,
  tabLineId,
  chargeGroupId,
}) {
  const idempotencyKey = chargeGroupId
    ? `billing:sale:${tabType}:group:${chargeGroupId}`
    : `billing:sale:${tabType}:line:${tabLineId}`;
  const movement = await StockMovement.findOne({ courtId, idempotencyKey })
    .select('stockWarning')
    .lean();
  if (!movement?.stockWarning) return null;
  return {
    itemId: String(movement.stockWarning.itemId),
    shortfall: movement.stockWarning.shortfall,
  };
}
