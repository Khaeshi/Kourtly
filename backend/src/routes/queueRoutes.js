import express from 'express';
import Match from '../models/Match.js';
import Player from '../models/Player.js';
import Tab from '../models/Tab.js';
import Item from '../models/Item.js';
import { emitCourtEvent } from '../lib/emitCourtEvent.js';

const router = express.Router();

// GET active matches (queued + playing)
router.get('/', async (req, res) => {
  try {
    const matches = await Match.find({  courtId: req.courtId, status: { $in: ['queued', 'playing'] } })
      .populate('team1 team2')
      .sort({ createdAt: 1 });
    res.json(matches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET history (done matches)
router.get('/history', async (req, res) => {
  try {
    const matches = await Match.find({ courtId: req.courtId, status: 'done' })
      .populate('team1 team2')
      .sort({ updatedAt: -1 })
      .limit(50);
    res.json(matches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @desc DELETE all history (done matches)
 */
router.delete('/history', async (req, res) => {
  try {
    const result = await Match.deleteMany({ courtId: req.courtId, status: 'done' });
    emitCourtEvent(req, 'queue:updated', { action: 'history_cleared', deletedCount: result.deletedCount });
    res.status(200).json({ message: `${result.deletedCount} done matches deleted successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create match + increment matchCount + optional shuttlecock split
// Body: { team1, team2, matchType, court, shuttlecockId? }
router.post('/', async (req, res) => {
  try {
    const { team1, team2, matchType, court, shuttlecockId } = req.body;

    // Create match
    const match = await Match.create({ courtId: req.courtId, team1, team2, matchType, court });

    // Increment matchCount for all 4 players
    const allPlayerIds = [...team1, ...team2];
    await Player.updateMany(
      { _id: { $in: allPlayerIds }, courtId: req.courtId }, 
      { $inc: { matchCount: 1 } }
    );


    // Auto-split shuttlecock if provided
    if (shuttlecockId) {
      const shuttle = await Item.findById({ _id: shuttlecockId, courtId: req.courtId });
      if (shuttle && shuttle.isSplittable) {
        const splitPrice = Math.round((shuttle.price / allPlayerIds.length) * 100) / 100;
        const itemName = `${shuttle.name} (÷${allPlayerIds.length})`;

        for (const playerId of allPlayerIds) {
          // Find or auto-create open tab
          let tab = await Tab.findOne({ courtId: req.courtId, player: playerId, status: 'open' });
          if (!tab) {
            tab = await Tab.create({ courtId: req.courtId, player: playerId, items: [], total: 0 });
          }
          await Tab.findOneAndUpdate(tab._id, {
            $push: { items: { item: shuttle._id, name: itemName, price: splitPrice, quantity: 1, addedAt: new Date() } },
            $inc:  { total: splitPrice },
          });
        }
      }
    }

    const populated = await Match.findById(match._id).populate('team1 team2');
    emitCourtEvent(req, 'queue:updated', { action: 'added', matchId: populated?._id });
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH update match status or court
router.patch('/:id', async (req, res) => {
  try {
    const match = await Match.findOneAndUpdate({ _id: req.params.id, courtId: req.courtId }, req.body, { new: true })
      .populate('team1 team2');
    if (!match) return res.status(404).json({ error: 'Match not found' });
    emitCourtEvent(req, 'queue:updated', { action: 'updated', matchId: match._id, status: match.status });
    res.json(match);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE match + decrement matchCount
router.delete('/:id', async (req, res) => {
  try {
    const match = await Match.findById({ _id: req.params.id, courtId: req.courtId });
    if (match) {
      const allPlayerIds = [...match.team1, ...match.team2];
      await Player.updateMany({ _id: { $in: allPlayerIds } }, { $inc: { matchCount: -1 } });
      await Match.findByIdAndDelete({ _id: req.params.id, courtId: req.courtId });
      emitCourtEvent(req, 'queue:updated', { action: 'deleted', matchId: req.params.id });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;