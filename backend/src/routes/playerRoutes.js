import express from 'express';
import Player from '../models/Player.js';
import { emitCourtEvent } from '../lib/emitCourtEvent.js';

const router = express.Router();
const PLAYER_FIELDS = ['name', 'level', 'gender', 'age'];

function readPlayerFields(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Request body must be an object.');
  }
  if (Object.keys(body).some(key => key.startsWith('$') || key.includes('.'))) {
    throw new Error('Operator and dotted-path keys are not allowed.');
  }

  const fields = {};
  for (const field of PLAYER_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    const value = body[field];
    const validType = field === 'age'
      ? typeof value === 'number' && Number.isFinite(value)
      : typeof value === 'string';
    if (!validType) throw new Error(`${field} has an invalid type.`);
    fields[field] = value;
  }
  return fields;
}

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
    const player = await Player.create({ ...readPlayerFields(req.body), courtId: req.courtId });
    emitCourtEvent(req, 'players:updated', { action: 'created', playerId: player._id });
    res.status(201).json(player);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH update player
router.patch('/:id', async (req, res) => {
  try {
    const updates = readPlayerFields(req.body);
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Provide an editable player field.' });
    }
    const player = await Player.findOneAndUpdate(
      { _id: req.params.id, courtId: req.courtId },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!player) return res.status(404).json({ error: 'Player not found.' });
    emitCourtEvent(req, 'players:updated', { action: 'updated', playerId: player._id });
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