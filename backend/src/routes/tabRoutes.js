import express from 'express';
import Tab from '../models/Tab.js';

const router = express.Router();

// GET open tabs
router.get('/open', async (req, res) => {
  try {
    const tabs = await Tab.find({ status: 'open' })
      .populate('player', 'name level')
      .sort({ createdAt: -1 });
    res.json(tabs.filter(t => t.player != null));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET paid tabs (history)
router.get('/history', async (req, res) => {
  try {
    const tabs = await Tab.find({ status: 'paid' })
      .populate('player', 'name level')
      .sort({ updatedAt: -1 })
      .limit(50);
    res.json(tabs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST open a new tab for a player
router.post('/', async (req, res) => {
  try {
    const existing = await Tab.findOne({ player: req.body.player, status: 'open' });
    if (existing) return res.status(400).json({ error: 'Player already has an open tab' });
    const tab = await Tab.create({ player: req.body.player, items: [], total: 0 });
    await tab.populate('player', 'name level');
    res.status(201).json(tab);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST add item to a single tab — no .save()
router.post('/:id/items', async (req, res) => {
  try {
    const { itemId, name, price, quantity = 1 } = req.body;
    const newItem = { item: itemId, name, price, quantity, addedAt: new Date() };
    const lineTotal = price * quantity;

    const tab = await Tab.findByIdAndUpdate(
      req.params.id,
      { $push: { items: newItem }, $inc: { total: lineTotal } },
      { new: true }
    ).populate('player', 'name level');

    if (!tab) return res.status(404).json({ error: 'Tab not found' });
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

    const isSplit    = playerIds.length > 1;
    const chargeAmt  = isSplit
      ? Math.round((price / playerIds.length) * 100) / 100
      : price;
    const itemLabel  = isSplit
      ? `${name} (split ÷${playerIds.length})`
      : name; // full charge — keep original name

    const results = [];

    for (const playerId of playerIds) {
      // Find open tab for this player (must exist — frontend only shows open tabs)
      let tab = await Tab.findOne({ player: playerId, status: 'open' });
      if (!tab) {
        tab = await Tab.create({ player: playerId, items: [], total: 0 });
      }

      const newItem = {
        item:     itemId || undefined,
        name:     itemLabel,
        price:    chargeAmt,
        quantity: 1,
        addedAt:  new Date(),
      };

      const updated = await Tab.findByIdAndUpdate(
        tab._id,
        { $push: { items: newItem }, $inc: { total: chargeAmt } },
        { new: true }
      ).populate('player', 'name level');

      results.push(updated);
    }

    res.json(results);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE remove item from tab by index
router.delete('/:id/items/:itemIndex', async (req, res) => {
  try {
    const tab = await Tab.findById(req.params.id);
    if (!tab) return res.status(404).json({ error: 'Tab not found' });

    const idx = Number(req.params.itemIndex);
    const removed = tab.items[idx];
    if (!removed) return res.status(404).json({ error: 'Item not found' });

    await Tab.findByIdAndUpdate(req.params.id, { $unset: { [`items.${idx}`]: 1 } });
    const updated = await Tab.findByIdAndUpdate(
      req.params.id,
      { $pull: { items: null }, $inc: { total: -(removed.price * removed.quantity) } },
      { new: true }
    ).populate('player', 'name level');

    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT mark tab as paid
router.put('/:id/pay', async (req, res) => {
  try {
    const tab = await Tab.findByIdAndUpdate(
      req.params.id,
      { status: 'paid' },
      { new: true }
    ).populate('player', 'name level');
    if (!tab) return res.status(404).json({ error: 'Tab not found' });
    res.json(tab);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE close/discard tab
router.delete('/:id', async (req, res) => {
  try {
    await Tab.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;