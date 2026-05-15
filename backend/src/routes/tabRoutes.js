import express from 'express';
import Tab from '../models/Tab.js';
import Item from '../models/Item.js';
import { emitCourtEvent } from '../lib/emitCourtEvent.js';

const router = express.Router();

const PLAYER_TAB_FILTER = {
  $or: [{ tabType: { $exists: false } }, { tabType: 'player' }],
};

// GET open tabs (player + cash walk-in)
router.get('/open', async (req, res) => {
  try {
    const tabs = await Tab.find({ courtId: req.courtId, status: 'open' })
      .populate('player', 'name level')
      .sort({ createdAt: -1 });
    res.json(tabs);
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
 * POST open tab — player tab (body.player) or cash tab (body.tabType === 'cash')
 */
router.post('/', async (req, res) => {
  try {
    const tabType = req.body.tabType === 'cash' ? 'cash' : 'player';

    if (tabType === 'cash') {
      const raw = String(req.body.cashLabel ?? '').trim();
      const cashLabel = raw || 'Cash sale';
      const tab = await Tab.create({
        courtId:   req.courtId,
        tabType:   'cash',
        cashLabel,
        player:    null,
        items:     [],
        total:     0,
      });
      await tab.populate('player', 'name level');
      emitCourtEvent(req, 'billing:tab_updated', { action: 'opened', tabId: tab._id });
      return res.status(201).json(tab);
    }

    const player = req.body.player;
    if (!player) {
      return res.status(400).json({ error: 'player is required for player tabs.' });
    }

    const existing = await Tab.findOne({
      courtId: req.courtId,
      player,
      status: 'open',
      ...PLAYER_TAB_FILTER,
    });
    if (existing) return res.status(400).json({ error: 'Player already has an open tab' });

    const tab = await Tab.create({
      courtId: req.courtId,
      tabType: 'player',
      player,
      items: [],
      total: 0,
    });
    await tab.populate('player', 'name level');
    emitCourtEvent(req, 'billing:tab_updated', { action: 'opened', tabId: tab._id });
    res.status(201).json(tab);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST add item to a single tab — no .save()
router.post('/:id/items', async (req, res) => {
  try {
    const { itemId, name, price, quantity = 1 } = req.body;
    let costEach = 0;
    if (itemId) {
      const catalogItem = await Item.findOne({ _id: itemId, courtId: req.courtId }).lean();
      if (catalogItem) costEach = Number(catalogItem.costPrice ?? 0);
    }
    const newItem = { item: itemId, name, price, quantity, costEach, addedAt: new Date() };
    const lineTotal = price * quantity;

    const tab = await Tab.findOneAndUpdate(
      { _id: req.params.id, courtId: req.courtId },
      { $push: { items: newItem }, $inc: { total: lineTotal } },
      { new: true }
    ).populate('player', 'name level');

    if (!tab) return res.status(404).json({ error: 'Tab not found' });
    emitCourtEvent(req, 'billing:tab_updated', { action: 'item_added', tabId: tab._id });
    res.json(tab);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST charge/split an item across one or more player tabs
// Body: { itemId, name, price, playerIds: [id1, ...] }
// 1 player  → full price charged to that player, label unchanged
// 2+ players → price divided evenly, label gets "(split ÷N)"
router.post('/split', async (req, res) => {
  try {
    const { itemId, name, price, playerIds } = req.body;
    if (!playerIds || playerIds.length < 1) {
      return res.status(400).json({ error: 'At least 1 player is required.' });
    }

    let splitCostEach = 0;
    if (itemId) {
      const catalogItem = await Item.findOne({ _id: itemId, courtId: req.courtId }).lean();
      if (catalogItem) splitCostEach = Number(catalogItem.costPrice ?? 0);
    }

    const isSplit    = playerIds.length > 1;
    const chargeAmt  = isSplit
      ? Math.round((price / playerIds.length) * 100) / 100
      : price;
    const costPortion = isSplit
      ? Math.round((splitCostEach / playerIds.length) * 100) / 100
      : splitCostEach;
    const itemLabel  = isSplit
      ? `${name} (split ÷${playerIds.length})`
      : name; // full charge — keep original name

    const results = [];

    for (const playerId of playerIds) {
      let tab = await Tab.findOne({
        courtId: req.courtId,
        player: playerId,
        status: 'open',
        ...PLAYER_TAB_FILTER,
      });
      if (!tab) {
        tab = await Tab.create({
          courtId: req.courtId,
          tabType: 'player',
          player: playerId,
          items: [],
          total: 0,
        });
      }

      const newItem = {
        item:     itemId || undefined,
        name:     itemLabel,
        price:    chargeAmt,
        costEach: costPortion,
        quantity: 1,
        addedAt:  new Date(),
      };

      const updated = await Tab.findOneAndUpdate(
        tab._id,
        { $push: { items: newItem }, $inc: { total: chargeAmt } },
        { new: true }
      ).populate('player', 'name level');

      results.push(updated);
    }

    emitCourtEvent(req, 'billing:tab_updated', { action: 'split_item_added', tabIds: results.map(t => t?._id).filter(Boolean) });
    res.json(results);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE remove item from tab by index
router.delete('/:id/items/:itemIndex', async (req, res) => {
  try {
    const tab = await Tab.findOne({ _id: req.params.id, courtId: req.courtId });
    if (!tab) return res.status(404).json({ error: 'Tab not found' });

    const idx = Number(req.params.itemIndex);
    const removed = tab.items[idx];
    if (!removed) return res.status(404).json({ error: 'Item not found' });

    await Tab.findOneAndUpdate(
      { _id: req.params.id, courtId: req.courtId },
      { $unset: { [`items.${idx}`]: 1 } }
    );
    const updated = await Tab.findOneAndUpdate(
      { _id: req.params.id, courtId: req.courtId },
      { $pull: { items: null }, $inc: { total: -(removed.price * removed.quantity) } },
      { new: true }
    ).populate('player', 'name level');

    emitCourtEvent(req, 'billing:tab_updated', { action: 'item_removed', tabId: updated?._id });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
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
  try {
    const deleted = await Tab.findOneAndDelete({ _id: req.params.id, courtId: req.courtId });
    if (!deleted) return res.status(404).json({ error: 'Tab not found' });
    emitCourtEvent(req, 'billing:tab_updated', { action: 'deleted', tabId: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
