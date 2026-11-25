import express from 'express';
import Item from '../models/Item.js';
import { emitCourtEvent } from '../lib/emitCourtEvent.js';
import { enrichItemsWithStock } from '../services/itemStock.js';
import { readAllowedBody, readItemPrice } from '../lib/billingValidation.js';
import { MAX_STOCK_QUANTITY } from '../lib/stockLimits.js';

const router = express.Router();
const ITEM_FIELDS = ['name', 'price', 'category', 'isActive', 'isSplittable', 'lowStockThreshold', 'note'];

function readItemFields(body) {
  const source = readAllowedBody(body, ITEM_FIELDS);
  const fields = {};
  for (const field of ITEM_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(source, field)) continue;
    const value = source[field];
    if (field === 'price') {
      fields.price = readItemPrice(value);
    } else if (field === 'isActive' || field === 'isSplittable') {
      if (typeof value !== 'boolean') throw new Error(`${field} must be a boolean.`);
      fields[field] = value;
    } else if (field === 'lowStockThreshold') {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) ||
          value < 0 || value > MAX_STOCK_QUANTITY) {
        throw new Error(`lowStockThreshold must be a non-negative integer no greater than ${MAX_STOCK_QUANTITY}.`);
      }
      fields[field] = value;
    } else {
      if (typeof value !== 'string') throw new Error(`${field} must be a string.`);
      fields[field] = value;
    }
  }
  return fields;
}

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
    const fields = readItemFields(req.body);
    if (!Object.prototype.hasOwnProperty.call(fields, 'name') ||
        !Object.prototype.hasOwnProperty.call(fields, 'price')) {
      return res.status(400).json({ error: 'name and price are required.' });
    }
    const item = await Item.create({ ...fields, courtId: req.courtId });
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
    const updates = readItemFields(req.body);
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Provide an editable item field.' });
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