import express from 'express';
import Match from '../models/Match.js';
import Player from '../models/Player.js';
import Tab from '../models/Tab.js';
import Item from '../models/Item.js';
import { emitCourtEvent } from '../lib/emitCourtEvent.js';
import { generateAIText } from '../lib/ai/index.js';

const router = express.Router();
const LEVEL_ORDER = { A: 4, B: 3, C: 2, D: 1 };

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

router.post('/proofread', async (req, res) => {
  try {
    const { team1 = [], team2 = [], matchType } = req.body || {};
    if (!Array.isArray(team1) || !Array.isArray(team2) || team1.length !== 2 || team2.length !== 2) {
      return res.status(400).json({ error: 'team1 and team2 must each contain exactly 2 player ids.' });
    }

    const ids = [...team1, ...team2];
    const players = await Player.find({ _id: { $in: ids }, courtId: req.courtId }).lean();
    if (players.length !== 4) return res.status(400).json({ error: 'Some players are missing or outside court scope.' });
    const byId = new Map(players.map((p) => [String(p._id), p]));
    const t1 = team1.map((id) => byId.get(String(id))).filter(Boolean);
    const t2 = team2.map((id) => byId.get(String(id))).filter(Boolean);
    if (t1.length !== 2 || t2.length !== 2) {
      return res.status(400).json({ error: 'Invalid player mapping for match proofread.' });
    }

    const t1Score = t1.reduce((sum, p) => sum + (LEVEL_ORDER[p.level] || 0), 0);
    const t2Score = t2.reduce((sum, p) => sum + (LEVEL_ORDER[p.level] || 0), 0);
    const scoreGap = Math.abs(t1Score - t2Score);
    const levelGap = Math.abs((LEVEL_ORDER[t1[0].level] || 0) - (LEVEL_ORDER[t1[1].level] || 0)) +
      Math.abs((LEVEL_ORDER[t2[0].level] || 0) - (LEVEL_ORDER[t2[1].level] || 0));

    const heuristicVerdict = scoreGap <= 1 ? 'fair' : 'review';
    const heuristicReason = scoreGap <= 1
      ? 'Team level sums are closely balanced.'
      : 'Team level sums are far apart and may need manual adjustment.';

    let aiNarrative = '';
    try {
      aiNarrative = await generateAIText({
        maxTokens: 180,
        system: 'You are a badminton queue assistant for PlayKou. Review a generated match and explain if it is fair based on player levels and match type. Keep response under 90 words. Give practical, non-hyped reasoning.',
        prompt: `Match type: ${matchType || 'auto'}
Team A: ${t1.map((p) => `${p.name}(${p.level})`).join(', ')}
Team B: ${t2.map((p) => `${p.name}(${p.level})`).join(', ')}
Heuristic metrics: teamScoreGap=${scoreGap}, internalLevelVariance=${levelGap}
Return: verdict + short explanation.`,
      });
    } catch {
      aiNarrative = '';
    }

    res.json({
      verdict: heuristicVerdict,
      metrics: {
        teamScoreGap: scoreGap,
        internalLevelVariance: levelGap,
      },
      explanation: aiNarrative || heuristicReason,
      aiUsed: Boolean(aiNarrative),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
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