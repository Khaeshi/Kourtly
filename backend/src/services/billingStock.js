import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Item from '../models/Item.js';
import StockMovement from '../models/StockMovement.js';
import { emitCourtEvent } from '../lib/emitCourtEvent.js';

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

  const delta = type === 'sale' ? -quantity : quantity;
  const item = await Item.findOneAndUpdate(
    { _id: itemKey, courtId: req.courtId, trackStock: true },
    { $inc: { stockOnHand: delta } },
    { returnDocument: 'after', session },
  ).lean();
  if (!item) return null;

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
    balanceAfter: item.stockOnHand,
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
    emitCourtEvent(req, 'items:updated', {
      action: types.length === 1 ? `stock_${types[0]}` : 'stock_changed',
      itemId,
      stockOnHand: latest.stockOnHand,
      leftNow: latest.stockOnHand,
      isLowStock: latest.stockOnHand <= latest.lowStockThreshold,
      movementIds: itemChanges.map(change => String(change.movementId)),
    });
  }
}
