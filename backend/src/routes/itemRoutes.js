import express from 'express';
import Item from '../models/Item.js';

const router = express.Router();

// GET active items only
router.get('/', async (req, res) => {
  try {
    const items = await Item.find({ courtId: req.courtId, isActive: true }).sort({ category: 1, name: 1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all items including inactive (admin catalog)
router.get('/all', async (req, res) => {
  try {
    const items = await Item.find({ courtId: req.courtId }).sort({ category: 1, name: 1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET splittable items only (for queue shuttlecock picker)
router.get('/splittable', async (req, res) => {
  try {
    const items = await Item.find({ courtId: req.courtId, isActive: true, isSplittable: true }).sort({ name: 1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create item
router.post('/', async (req, res) => {
  try {
    const item = await Item.create({ ...req.body, courtId: req.courtId });
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update item (supports isSplittable)
router.put('/:id', async (req, res) => {
  try {
    const item = await Item.findOneAndUpdate({ _id: req.params.id, courtId: req.courtId }, req.body, { new: true });
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE soft delete
router.delete('/:id', async (req, res) => {
  try {
    await Item.findOneAndUpdate({ _id: req.params.id, courtId: req.courtId }, { isActive: false });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;