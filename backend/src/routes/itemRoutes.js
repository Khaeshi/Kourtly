import express from 'express';
import Item from '../models/Item.js';
import { emitCourtEvent } from '../lib/emitCourtEvent.js';
import { enrichItemsWithStock } from '../services/itemStock.js';

const router = express.Router();

async function respondWithItems(req, res, query) {
  const items = await query.lean();
  res.json(await enrichItemsWithStock(
    items,
    req.courtId,
    new Date(),
    req.court?.settings?.timezone || 'Asia/Manila'
  ));
}

// GET active items only
router.get('/', async (req, res) => {
  try {
    await respondWithItems(
      req,
      res,
      Item.find({ courtId: req.courtId, isActive: true }).sort({ category: 1, name: 1 })
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all items including inactive (admin catalog)
router.get('/all', async (req, res) => {
  try {
    await respondWithItems(
      req,
      res,
      Item.find({ courtId: req.courtId }).sort({ category: 1, name: 1 })
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET splittable items only (for queue shuttlecock picker)
router.get('/splittable', async (req, res) => {
  try {
    await respondWithItems(
      req,
      res,
      Item.find({ courtId: req.courtId, isActive: true, isSplittable: true }).sort({ name: 1 })
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create item
router.post('/', async (req, res) => {
  try {
    const item = await Item.create({
      name: req.body?.name,
      price: req.body?.price,
      category: req.body?.category,
      isActive: req.body?.isActive,
      isSplittable: req.body?.isSplittable,
      lowStockThreshold: req.body?.lowStockThreshold,
      note: req.body?.note,
      courtId: req.courtId,
    });
    emitCourtEvent(req, 'items:updated', { action: 'created', itemId: item._id });
    const [enrichedItem] = await enrichItemsWithStock(
      [item.toObject()],
      req.courtId,
      new Date(),
      req.court?.settings?.timezone || 'Asia/Manila'
    );
    res.status(201).json(enrichedItem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update item (supports isSplittable)
router.put('/:id', async (req, res) => {
  try {
    const updates = {};
    for (const field of ['name', 'price', 'category', 'isActive', 'isSplittable', 'lowStockThreshold', 'note']) {
      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, field)) {
        updates[field] = req.body[field];
      }
    }
    const item = await Item.findOneAndUpdate(
      { _id: req.params.id, courtId: req.courtId },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!item) return res.status(404).json({ error: 'Item not found' });
    emitCourtEvent(req, 'items:updated', { action: 'updated', itemId: item._id });
    const [enrichedItem] = await enrichItemsWithStock(
      [item.toObject()],
      req.courtId,
      new Date(),
      req.court?.settings?.timezone || 'Asia/Manila'
    );
    res.json(enrichedItem);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE soft delete
router.delete('/:id', async (req, res) => {
  try {
    await Item.findOneAndUpdate({ _id: req.params.id, courtId: req.courtId }, { isActive: false });
    emitCourtEvent(req, 'items:updated', { action: 'deleted', itemId: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;