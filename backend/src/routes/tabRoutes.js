import express from 'express';
import mongoose from 'mongoose';
import Tab from '../models/Tab.js';
import Player from '../models/Player.js';
import Item from '../models/Item.js';
import { emitCourtEvent } from '../lib/emitCourtEvent.js';
import {
  readAllowedBody,
  readIdempotencyKey,
  readItemPrice,
  readLineQuantity,
  readTabTotal,
} from '../lib/billingValidation.js';
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
      .populate({ path: 'player', select: 'name level', match: { courtId: req.courtId } })
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
        .populate({ path: 'player', select: 'name level', match: { courtId: req.courtId } })
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limitNum),
      Tab.countDocuments(query),
    ]);

    res.json({
      tabs: tabs.filter(tab => tab.player != null),
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
    const body = readAllowedBody(req.body, ['player']);
    if (typeof body.player !== 'string' || !mongoose.Types.ObjectId.isValid(body.player)) {
      return res.status(400).json({ error: 'player must be a valid player ID.' });
    }
    const player = await Player.findOne({ _id: body.player, courtId: req.courtId }).select('_id');
    if (!player) return res.status(400).json({ error: 'Player not found in this court.' });
    const existing = await Tab.findOne({
      courtId: req.courtId,
      player: body.player,
       status: 'open' 
      });
    if (existing) return res.status(400).json({ error: 'Player already has an open tab' });
    const tab = await Tab.create({ courtId: req.courtId, player: body.player, items: [], total: 0 });
    await tab.populate({ path: 'player', select: 'name level', match: { courtId: req.courtId } });
    if (!tab.player) return res.status(409).json({ error: 'Player is missing or outside court scope.' });
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
    const body = readAllowedBody(req.body, ['itemId', 'name', 'price', 'quantity', 'idempotencyKey']);
    const { itemId } = body;
    if (typeof itemId !== 'string' || !mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ error: 'itemId must be a valid item ID.' });
    }
    if (body.name !== undefined && typeof body.name !== 'string') {
      return res.status(400).json({ error: 'name must be a string.' });
    }
    if (body.price !== undefined) readItemPrice(body.price);
    const quantity = readLineQuantity(body.quantity === undefined ? 1 : body.quantity);
    const idempotencyKey = readIdempotencyKey(body.idempotencyKey);
    const item = await Item.findOne({ _id: itemId, courtId: req.courtId }).select('_id name price');
    if (!item) return res.status(400).json({ error: 'Item not found in this court.' });
    readItemPrice(item.price);
    if (idempotencyKey) {
      const replay = await Tab.findOne({ _id: req.params.id, courtId: req.courtId, 'items.idempotencyKey': idempotencyKey })
        .populate({ path: 'player', select: 'name level', match: { courtId: req.courtId } });
      if (replay) {
        if (!replay.player) return res.status(409).json({ error: 'Player is missing or outside court scope.' });
        return res.json(replay);
      }
    }

    await session.withTransaction(async () => {
      stockChanges.length = 0;
      const transactionItem = await Item.findOne({
        _id: itemId, courtId: req.courtId,
      }).select('_id name price').session(session);
      if (!transactionItem) {
        const error = new Error('Item not found in this court.');
        error.status = 400;
        throw error;
      }
      const price = readItemPrice(transactionItem.price);
      const lineTotal = price * quantity;
      if (!Number.isFinite(lineTotal)) {
        const error = new Error('Item charge must be a finite amount.');
        error.status = 400;
        throw error;
      }
      tab = await Tab.findOne({ _id: req.params.id, courtId: req.courtId }).session(session);
      if (!tab) {
        const error = new Error('Tab not found');
        error.status = 404;
        throw error;
      }
      const tabPlayer = await Player.findOne({
        _id: tab.player, courtId: req.courtId,
      }).select('_id').session(session);
      if (!tabPlayer) {
        const error = new Error('Player is missing or outside court scope.');
        error.status = 400;
        throw error;
      }

      tab.total = readTabTotal(tab.total, lineTotal);
      tab.items.push({
        item: transactionItem._id,
        name: transactionItem.name,
        price,
        quantity,
        idempotencyKey,
        addedAt: new Date(),
      });
      const line = tab.items[tab.items.length - 1];
      await tab.save({ session });

      const change = await recordBillingStockMovement({
        req, session, itemId: transactionItem._id, type: 'sale', quantity, unitPrice: price,
        note: 'Tab charge', tabType: 'queue', tabId: tab._id, tabLineId: line._id,
      });
      if (change) stockChanges.push(change);
    });

    tab = await Tab.findOne({ _id: req.params.id, courtId: req.courtId })
      .populate({ path: 'player', select: 'name level', match: { courtId: req.courtId } });
    if (!tab?.player) return res.status(409).json({ error: 'Player is missing or outside court scope.' });
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
    const body = readAllowedBody(req.body, ['itemId', 'name', 'price', 'playerIds', 'idempotencyKey']);
    const { itemId, playerIds } = body;
    if (typeof itemId !== 'string' || !mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ error: 'itemId must be a valid item ID.' });
    }
    if (body.name !== undefined && typeof body.name !== 'string') {
      return res.status(400).json({ error: 'name must be a string.' });
    }
    if (body.price !== undefined) readItemPrice(body.price);
    if (!Array.isArray(playerIds) || playerIds.length < 1 ||
        playerIds.some(playerId => typeof playerId !== 'string' || !mongoose.Types.ObjectId.isValid(playerId))) {
      return res.status(400).json({ error: 'At least 1 player is required.' });
    }
    if (new Set(playerIds).size !== playerIds.length) {
      return res.status(400).json({ error: 'A player may only be charged once.' });
    }
    const idempotencyKey = readIdempotencyKey(body.idempotencyKey);
    const [item, players] = await Promise.all([
      Item.findOne({ _id: itemId, courtId: req.courtId }).select('_id name price'),
      Player.find({ _id: { $in: playerIds }, courtId: req.courtId }).select('_id'),
    ]);
    if (!item) return res.status(400).json({ error: 'Item not found in this court.' });
    if (players.length !== playerIds.length) {
      return res.status(400).json({ error: 'Some players are missing or outside court scope.' });
    }
    readItemPrice(item.price);
    if (idempotencyKey) {
      const replayLines = await Tab.find({
        courtId: req.courtId,
        'items.idempotencyKey': idempotencyKey,
      }).populate({ path: 'player', select: 'name level', match: { courtId: req.courtId } });
      if (replayLines.length) {
        if (replayLines.some(tab => !tab.player)) {
          return res.status(409).json({ error: 'A player is missing or outside court scope.' });
        }
        return res.json(replayLines);
      }
    }

    const isSplit = playerIds.length > 1;
    let chargeAmt;
    let itemLabel;

    const chargeGroupId = playerIds.length > 1 ? new mongoose.Types.ObjectId() : null;
    await session.withTransaction(async () => {
      stockChanges.length = 0;
      results = [];
      let firstLine;
      let firstTab;
      const transactionPlayers = await Player.find({
        _id: { $in: playerIds },
        courtId: req.courtId,
      }).select('_id').session(session);
      const transactionItem = await Item.findOne({
        _id: itemId,
        courtId: req.courtId,
      }).select('_id name price').session(session);
      if (transactionPlayers.length !== playerIds.length || !transactionItem) {
        const error = new Error('Item or players are missing or outside court scope.');
        error.status = 400;
        throw error;
      }
      const transactionPrice = readItemPrice(transactionItem.price);
      chargeAmt = isSplit
        ? Math.round((transactionPrice / playerIds.length) * 100) / 100
        : transactionPrice;
      itemLabel = isSplit
        ? `${transactionItem.name} (split ÷${playerIds.length})`
        : transactionItem.name;

      for (const playerId of playerIds) {
        let tab = await Tab.findOne({ courtId: req.courtId, player: playerId, status: 'open' })
          .session(session);
        if (!tab) {
          [tab] = await Tab.create([{
            courtId: req.courtId, player: playerId, items: [], total: 0,
          }], { session });
        }

        tab.items.push({
          item: transactionItem._id,
          name: itemLabel,
          price: chargeAmt,
          quantity: 1,
          ...(chargeGroupId ? { chargeGroupId } : {}),
          idempotencyKey: idempotencyKey || null,
          addedAt: new Date(),
        });
        tab.total = readTabTotal(tab.total, chargeAmt);
        const line = tab.items[tab.items.length - 1];
        await tab.save({ session });
        firstLine ??= line;
        firstTab ??= tab;
        results.push(tab);
      }

      if (chargeGroupId && firstLine && firstTab) {
        const change = await recordBillingStockMovement({
          req, session, itemId: transactionItem._id, type: 'sale', quantity: 1,
          unitPrice: chargeAmt * playerIds.length,
          note: 'Split tab charge', tabType: 'queue', tabId: firstTab._id,
          tabLineId: firstLine._id, chargeGroupId,
        });
        if (change) stockChanges.push(change);
      } else if (firstLine && firstTab) {
        const change = await recordBillingStockMovement({
          req, session, itemId: transactionItem._id, type: 'sale', quantity: 1, unitPrice: chargeAmt,
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
    }).populate({ path: 'player', select: 'name level', match: { courtId: req.courtId } });
    if (populatedTabs.some(tab => !tab.player)) {
      return res.status(409).json({ error: 'A player is missing or outside court scope.' });
    }
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
      const tabPlayer = await Player.findOne({
        _id: tab.player, courtId: req.courtId,
      }).select('_id').session(session);
      if (!tabPlayer) {
        const error = new Error('Player is missing or outside court scope.');
        error.status = 400;
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
      .populate({ path: 'player', select: 'name level', match: { courtId: req.courtId } });
    if (!updated?.player) return res.status(409).json({ error: 'Player is missing or outside court scope.' });
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