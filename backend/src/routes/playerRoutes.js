import express from 'express';
import Player from '../models/Player.js';
import { emitCourtEvent } from '../lib/emitCourtEvent.js';

const router = express.Router();

// GET all active players (sorted by matchCount asc)
router.get('/', async (req, res) => {
  try {
    const players = await Player.find({ courtId: req.courtId, isActive: true }).sort({ matchCount: 1, createdAt: 1 });
    res.json(players);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create player
router.post('/', async (req, res) => {
  try {
    const player = await Player.create({ ...req.body, courtId: req.courtId });
    emitCourtEvent(req, 'players:updated', { action: 'created', playerId: player._id });
    res.status(201).json(player);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH update player
router.patch('/:id', async (req, res) => {
  try {
    const player = await Player.findOneAndUpdate({ _id: req.params.id, courtId: req.courtId }, req.body, { new: true });
    emitCourtEvent(req, 'players:updated', { action: 'updated', playerId: player?._id || req.params.id });
    res.json(player);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE soft-delete player
router.delete('/:id', async (req, res) => {
  try {
    await Player.findOneAndUpdate({ _id: req.params.id, courtId: req.courtId }, { isActive: false });
    emitCourtEvent(req, 'players:updated', { action: 'deactivated', playerId: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;