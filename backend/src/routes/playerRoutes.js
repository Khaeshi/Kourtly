import express from 'express';
import Player from '../models/Player.js';

const router = express.Router();

// GET all active players (sorted by matchCount asc)
router.get('/', async (req, res) => {
  try {
    const players = await Player.find({ isActive: true }).sort({ matchCount: 1, createdAt: 1 });
    res.json(players);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create player
router.post('/', async (req, res) => {
  try {
    const player = await Player.create(req.body);
    res.status(201).json(player);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH update player
router.patch('/:id', async (req, res) => {
  try {
    const player = await Player.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(player);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE soft-delete player
router.delete('/:id', async (req, res) => {
  try {
    await Player.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;