import express from 'express';
import mongoose from 'mongoose';
import Tab from '../models/Tab.js';
import { emitCourtEvent } from '../lib/emitCourtEvent.js';
import {
  emitBillingStockUpdates,
  recordBillingStockMovement,
  removeChargeGroup,
} from '../services/billingStock.js';

const router = express.Router();

// GET open tabs
router.get('/open', async (req, res) => {
  try {
    const tabs = await Tab.find({ courtId: req.courtId, status: 'open' })
      .populate('player', 'name level')
      .sort({ createdAt: -1 });
    res.json(tabs.filter(t => t.player != null));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * @desc GET tab history (paid + unpaid) with pagination + date filter
 * @summary ?status=paid|unpaid|all  &date=YYYY-MM-DD &page=1  &limit=20
 */
router.get('/history', async (req, res) => {
  try {
    const { status = 'all', date, page = '1', limit = '20' } = req.query;
    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit));
    const skip     = (pageNum - 1) * limitNum;

    const query = { courtId: req.courtId };
    if (status === 'paid')   query.status = 'paid';
    else if (status === 'unpaid') query.status = 'unpaid';
    else query.status = { $in: ['paid', 'unpaid'] };

    if (date) {
      const start = new Date(date + 'T00:00:00.000Z');
      const end   = new Date(date + 'T23:59:59.999Z');
      query.updatedAt = { $gte: start, $lte: end };
    }

    const [tabs, total] = await Promise.all([
      Tab.find(query)
        .populate('player', 'name level')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Tab.countDocuments(query),
    ]);

    res.json({
      tabs,
      pagination: {
        page:       pageNum,
        limit:      limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        hasNext:    pageNum < Math.ceil(total / limitNum),
        hasPrev:    pageNum > 1,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST 
 * @desc open a new tab for a player
 */
// POST open a new tab for a player
router.post('/', async (req, res) => {
  try {
    const existing = await Tab.findOne({
      courtId: req.courtId,
      player: req.body.player,
       status: 'open' 
      });
    if (existing) return res.status(400).json({ error: 'Player already has an open tab' });
    const tab = await Tab.create({ courtId: req.courtId, player: req.body.player, items: [], total: 0 });
    await tab.populate('player', 'name level');
    emitCourtEvent(req, 'billing:tab_updated', { action: 'opened', tabId: tab._id });
    res.status(201).json(tab);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST add item to a single tab
router.post('/:id/items', async (req, res) => {
  const session = await mongoose.startSession();
  const stockChanges = [];
  let tab;
  try {
    const { itemId, name, price, quantity = 1, idempotencyKey } = req.body;
    if (idempotencyKey) {
      const replay = await Tab.findOne({ _id: req.params.id, courtId: req.courtId, 'items.idempotencyKey': idempotencyKey })
        .populate('player', 'name level');
      if (replay) return res.json(replay);
    }
    const lineTotal = price * quantity;

    await session.withTransaction(async () => {
      stockChanges.length = 0;
      tab = await Tab.findOne({ _id: req.params.id, courtId: req.courtId }).session(session);
      if (!tab) {
        const error = new Error('Tab not found');
        error.status = 404;
        throw error;
      }

      tab.items.push({ item: itemId, name, price, quantity, idempotencyKey: idempotencyKey || null, addedAt: new Date() });
      tab.total += lineTotal;
      const line = tab.items[tab.items.length - 1];
      await tab.save({ session });

      const change = await recordBillingStockMovement({
        req, session, itemId, type: 'sale', quantity, unitPrice: price,
        note: 'Tab charge', tabType: 'queue', tabId: tab._id, tabLineId: line._id,
      });
      if (change) stockChanges.push(change);
    });

    tab = await Tab.findOne({ _id: req.params.id, courtId: req.courtId })
      .populate('player', 'name level');
    emitCourtEvent(req, 'billing:tab_updated', { action: 'item_added', tabId: tab._id });
    await emitBillingStockUpdates(req, stockChanges);
    res.json(tab);
  } catch (err) {
    res.status(err.status ?? 400).json({ error: err.message });
  } finally {
    await session.endSession();
  }
});

// POST charge/split an item across one or more player tabs
// Body: { itemId, name, price, playerIds: [id1, ...] }
// 1 player  → full price charged to that player, label unchanged
// 2+ players → price divided evenly, label gets "(split ÷N)"
router.post('/split', async (req, res) => {
  const session = await mongoose.startSession();
  const stockChanges = [];
  let results = [];
  try {
    const { itemId, name, price, playerIds, idempotencyKey } = req.body;
    if (!playerIds || playerIds.length < 1) {
      return res.status(400).json({ error: 'At least 1 player is required.' });
    }
    if (idempotencyKey) {
      const replayLines = await Tab.find({
        courtId: req.courtId,
        'items.idempotencyKey': idempotencyKey,
      }).populate('player', 'name level');
      if (replayLines.length) return res.json(replayLines);
    }

    const isSplit    = playerIds.length > 1;
    const chargeAmt  = isSplit
      ? Math.round((price / playerIds.length) * 100) / 100
      : price;
    const itemLabel  = isSplit
      ? `${name} (split ÷${playerIds.length})`
      : name; // full charge — keep original name

    const chargeGroupId = playerIds.length > 1 ? new mongoose.Types.ObjectId() : null;
    await session.withTransaction(async () => {
      stockChanges.length = 0;
      results = [];
      let firstLine;
      let firstTab;

      for (const playerId of playerIds) {
        let tab = await Tab.findOne({ courtId: req.courtId, player: playerId, status: 'open' })
          .session(session);
        if (!tab) {
          [tab] = await Tab.create([{
            courtId: req.courtId, player: playerId, items: [], total: 0,
          }], { session });
        }

        tab.items.push({
          item: itemId || undefined,
          name: itemLabel,
          price: chargeAmt,
          quantity: 1,
          ...(chargeGroupId ? { chargeGroupId } : {}),
          idempotencyKey: idempotencyKey || null,
          addedAt: new Date(),
        });
        tab.total += chargeAmt;
        const line = tab.items[tab.items.length - 1];
        await tab.save({ session });
        firstLine ??= line;
        firstTab ??= tab;
        results.push(tab);
      }

      if (chargeGroupId && firstLine && firstTab) {
        const change = await recordBillingStockMovement({
          req, session, itemId, type: 'sale', quantity: 1,
          unitPrice: chargeAmt * playerIds.length,
          note: 'Split tab charge', tabType: 'queue', tabId: firstTab._id,
          tabLineId: firstLine._id, chargeGroupId,
        });
        if (change) stockChanges.push(change);
      } else if (firstLine && firstTab) {
        const change = await recordBillingStockMovement({
          req, session, itemId, type: 'sale', quantity: 1, unitPrice: chargeAmt,
          note: 'Tab charge', tabType: 'queue', tabId: firstTab._id,
          tabLineId: firstLine._id,
        });
        if (change) stockChanges.push(change);
      }
    });

    const resultTabIds = results.map(tab => String(tab._id));
    const populatedTabs = await Tab.find({
      _id: { $in: resultTabIds },
      courtId: req.courtId,
    }).populate('player', 'name level');
    const tabsById = new Map(populatedTabs.map(tab => [String(tab._id), tab]));
    results = resultTabIds.map(id => tabsById.get(id)).filter(Boolean);
    emitCourtEvent(req, 'billing:tab_updated', { action: 'split_item_added', tabIds: results.map(t => t?._id).filter(Boolean) });
    await emitBillingStockUpdates(req, stockChanges);
    res.json(results);
  } catch (err) {
    res.status(err.status ?? 400).json({ error: err.message });
  } finally {
    await session.endSession();
  }
});

// DELETE remove item from tab by index
router.delete('/:id/items/:itemIndex', async (req, res) => {
  const session = await mongoose.startSession();
  const stockChanges = [];
  let updated;
  let affectedTabIds = [];
  try {
    await session.withTransaction(async () => {
      stockChanges.length = 0;
      affectedTabIds = [];
      const tab = await Tab.findOne({ _id: req.params.id, courtId: req.courtId }).session(session);
      if (!tab) {
        const error = new Error('Tab not found');
        error.status = 404;
        throw error;
      }

      const idx = Number(req.params.itemIndex);
      const removed = tab.items[idx];
      if (!removed) {
        const error = new Error('Item not found');
        error.status = 404;
        throw error;
      }

      if (removed.chargeGroupId) {
        const groupTabs = await removeChargeGroup({
          model: Tab, courtId: req.courtId, chargeGroupId: removed.chargeGroupId, session,
        });
        affectedTabIds = groupTabs.map(entry => String(entry.tab._id));
        const change = await recordBillingStockMovement({
          req, session, itemId: removed.item, type: 'void', quantity: 1,
          unitPrice: removed.price,
          note: 'Split tab charge removed', tabType: 'queue',
          tabId: tab._id, tabLineId: removed._id,
          chargeGroupId: removed.chargeGroupId,
        });
        if (change) stockChanges.push(change);
      } else {
        tab.items.splice(idx, 1);
        tab.total -= removed.price * removed.quantity;
        await tab.save({ session });
        affectedTabIds = [String(tab._id)];
        const change = await recordBillingStockMovement({
          req, session, itemId: removed.item, type: 'void',
          quantity: removed.quantity, unitPrice: removed.price,
          note: 'Tab line removed', tabType: 'queue',
          tabId: tab._id, tabLineId: removed._id,
        });
        if (change) stockChanges.push(change);
      }
    });

    updated = await Tab.findOne({ _id: req.params.id, courtId: req.courtId })
      .populate('player', 'name level');
    emitCourtEvent(req, 'billing:tab_updated', {
      action: 'item_removed', tabId: req.params.id, tabIds: affectedTabIds,
    });
    await emitBillingStockUpdates(req, stockChanges);
    res.json(updated);
  } catch (err) {
    res.status(err.status ?? 400).json({ error: err.message });
  } finally {
    await session.endSession();
  }
});

/**
 * @desc PUT mark tab as unpaid (soft close - keeps record, marks as debt)
 */
router.put('/:id/unpaid', async (req, res) => {
  try {
    const tab = await Tab.findOneAndUpdate(
      { _id: req.params.id, courtId: req.courtId },
      { status: 'unpaid' },
      { new: true }
    ).populate('player', 'name level');
    if (!tab) return res.status(404).json({ error: 'Tab not found' });
    emitCourtEvent(req, 'billing:tab_paid', { action: 'marked_unpaid', tabId: tab._id });
    emitCourtEvent(req, 'analytics:refresh', { source: 'tabs' });
    res.json(tab);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT mark unpaid tab as paid
router.put('/:id/pay-unpaid', async (req, res) => {
  try {
    const tab = await Tab.findOneAndUpdate(
      { _id: req.params.id, courtId: req.courtId },
      { status: 'paid' },
      { new: true }
    ).populate('player', 'name level');
    if (!tab) return res.status(404).json({ error: 'Tab not found' });
    emitCourtEvent(req, 'billing:tab_paid', { action: 'unpaid_collected', tabId: tab._id });
    emitCourtEvent(req, 'analytics:refresh', { source: 'tabs' });
    res.json(tab);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT mark tab as paid
router.put('/:id/pay', async (req, res) => {
  try {
    const tab = await Tab.findOneAndUpdate(
      { _id: req.params.id, courtId: req.courtId },
      { status: 'paid' },
      { new: true }
    ).populate('player', 'name level');
    if (!tab) return res.status(404).json({ error: 'Tab not found' });
    emitCourtEvent(req, 'billing:tab_paid', { action: 'paid', tabId: tab._id });
    emitCourtEvent(req, 'analytics:refresh', { source: 'tabs' });
    res.json(tab);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE close/discard tab
router.delete('/:id', async (req, res) => {
  const session = await mongoose.startSession();
  const stockChanges = [];
  try {
    let deleted = false;
    let affectedTabIds = [];
    await session.withTransaction(async () => {
      stockChanges.length = 0;
      deleted = false;
      affectedTabIds = [];
      const tab = await Tab.findOne({ _id: req.params.id, courtId: req.courtId }).session(session);
      if (!tab) return;

      const groups = [...new Set(tab.items
        .map(line => line.chargeGroupId && String(line.chargeGroupId))
        .filter(Boolean))];
      for (const groupId of groups) {
        const line = tab.items.find(entry => String(entry.chargeGroupId) === groupId);
        const groupTabs = await removeChargeGroup({
          model: Tab, courtId: req.courtId, chargeGroupId: groupId, session,
        });
        affectedTabIds.push(...groupTabs.map(entry => String(entry.tab._id)));
        const change = await recordBillingStockMovement({
          req, session, itemId: line.item, type: 'void', quantity: 1,
          unitPrice: line.price,
          note: 'Split tab discarded', tabType: 'queue',
          tabId: tab._id, tabLineId: line._id, chargeGroupId: line.chargeGroupId,
        });
        if (change) stockChanges.push(change);
      }

      for (const line of tab.items) {
        if (line.chargeGroupId) continue;
        const change = await recordBillingStockMovement({
          req, session, itemId: line.item, type: 'void',
          quantity: line.quantity, unitPrice: line.price,
          note: 'Tab discarded', tabType: 'queue',
          tabId: tab._id, tabLineId: line._id,
        });
        if (change) stockChanges.push(change);
      }
      await Tab.deleteOne({ _id: tab._id, courtId: req.courtId }).session(session);
      affectedTabIds.push(String(tab._id));
      deleted = true;
    });
    if (!deleted) return res.status(404).json({ error: 'Tab not found' });
    emitCourtEvent(req, 'billing:tab_updated', {
      action: 'deleted', tabId: req.params.id, tabIds: [...new Set(affectedTabIds)],
    });
    await emitBillingStockUpdates(req, stockChanges);
    res.json({ success: true });
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message });
  } finally {
    await session.endSession();
  }
});

export default router;