import express from 'express';
import mongoose from 'mongoose';
import Match from '../models/Match.js';
import Player from '../models/Player.js';
import Tab from '../models/Tab.js';
import Item from '../models/Item.js';
import { emitCourtEvent } from '../lib/emitCourtEvent.js';
import { generateAIText } from '../lib/ai/index.js';
import {
  emitBillingStockUpdates,
  recordBillingStockMovement,
} from '../services/billingStock.js';

const router = express.Router();
const LEVEL_ORDER = { A: 4, B: 3, C: 2, D: 1 };
const MATCH_TYPES = new Set(['MD', 'WD', 'XD']);

function readQueueBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Request body must be an object.');
  }
  if (Object.keys(body).some(key =>
    key.startsWith('$') || key.includes('.') ||
    ['__proto__', 'prototype', 'constructor'].includes(key)
  )) {
    throw new Error('Operator and dotted-path keys are not allowed.');
  }
  return body;
}

function readPlayerIds(value, field) {
  if (!Array.isArray(value) || value.length !== 2 ||
      value.some(id => typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id))) {
    throw new Error(`${field} must contain exactly 2 valid player IDs.`);
  }
  return value;
}

function readQueueFields(body, { allowShuttlecock = false } = {}) {
  const source = readQueueBody(body);
  const fields = {};

  for (const field of ['team1', 'team2']) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      fields[field] = readPlayerIds(source[field], field);
    }
  }

  if (Object.prototype.hasOwnProperty.call(source, 'matchType')) {
    if (typeof source.matchType !== 'string' || !MATCH_TYPES.has(source.matchType)) {
      throw new Error('matchType must be MD, WD, or XD.');
    }
    fields.matchType = source.matchType;
  }

  if (Object.prototype.hasOwnProperty.call(source, 'court')) {
    if (typeof source.court !== 'number' || !Number.isInteger(source.court) || source.court < 1) {
      throw new Error('court must be a positive integer.');
    }
    fields.court = source.court;
  }

  if (allowShuttlecock && Object.prototype.hasOwnProperty.call(source, 'shuttlecockId')) {
    if (typeof source.shuttlecockId !== 'string' ||
        !mongoose.Types.ObjectId.isValid(source.shuttlecockId)) {
      throw new Error('shuttlecockId must be a valid item ID.');
    }
    fields.shuttlecockId = source.shuttlecockId;
  }

  return fields;
}

async function playerIdsBelongToCourt(playerIds, courtId, session) {
  if (playerIds.length === 0) return true;
  const players = await Player.find({
    _id: { $in: playerIds },
    courtId,
  }).select('_id').session(session);
  return players.length === playerIds.length;
}

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
  const session = await mongoose.startSession();
  const stockChanges = [];
  let match;
  let tabIds = [];
  try {
    const fields = readQueueFields(req.body, { allowShuttlecock: true });
    const { team1, team2, matchType, court, shuttlecockId } = fields;
    if (!team1 || !team2 || !matchType || !court) {
      return res.status(400).json({ error: 'team1, team2, matchType, and court are required.' });
    }
    const allPlayerIds = [...team1, ...team2];
    if (new Set(allPlayerIds).size !== allPlayerIds.length) {
      return res.status(400).json({ error: 'A player may only appear once in a match.' });
    }
    let shuttlecockGroupId;
    await session.withTransaction(async () => {
      stockChanges.length = 0;
      tabIds = [];
      if (!await playerIdsBelongToCourt(allPlayerIds, req.courtId, session)) {
        const error = new Error('Some players are missing or outside court scope.');
        error.status = 400;
        throw error;
      }
      [match] = await Match.create([{
        courtId: req.courtId, team1, team2, matchType, court,
      }], { session });

      await Player.updateMany(
        { _id: { $in: allPlayerIds }, courtId: req.courtId },
        { $inc: { matchCount: 1 } },
        { session }
      );

      if (shuttlecockId) {
        const shuttle = await Item.findOne({
          _id: shuttlecockId, courtId: req.courtId,
        }).session(session);
        if (shuttle && shuttle.isSplittable) {
          shuttlecockGroupId = new mongoose.Types.ObjectId();
          const splitPrice = Math.round((shuttle.price / allPlayerIds.length) * 100) / 100;
          const itemName = `${shuttle.name} (÷${allPlayerIds.length})`;
          let firstTab;
          let firstLine;

          for (const playerId of allPlayerIds) {
            let tab = await Tab.findOne({
              courtId: req.courtId, player: playerId, status: 'open',
            }).session(session);
            if (!tab) {
              [tab] = await Tab.create([{
                courtId: req.courtId, player: playerId, items: [], total: 0,
              }], { session });
            }
            tab.items.push({
              item: shuttle._id,
              name: itemName,
              price: splitPrice,
              quantity: 1,
              chargeGroupId: shuttlecockGroupId,
              addedAt: new Date(),
            });
            tab.total += splitPrice;
            const line = tab.items[tab.items.length - 1];
            await tab.save({ session });
            firstTab ??= tab;
            firstLine ??= line;
            tabIds.push(String(tab._id));
          }

          const change = await recordBillingStockMovement({
            req, session, itemId: shuttle._id, type: 'sale', quantity: 1,
            unitPrice: splitPrice * allPlayerIds.length,
            note: 'Queue shuttlecock split',
            tabType: 'queue', tabId: firstTab._id, tabLineId: firstLine._id,
            chargeGroupId: shuttlecockGroupId,
          });
          if (change) stockChanges.push(change);
        }
      }
    });

    const populated = await Match.findOne({ _id: match._id, courtId: req.courtId }).populate('team1 team2');
    emitCourtEvent(req, 'queue:updated', { action: 'added', matchId: populated?._id });
    if (shuttlecockGroupId) {
      emitCourtEvent(req, 'billing:tab_updated', {
        action: 'queue_shuttlecock_split',
        matchId: String(match._id),
        tabIds,
      });
    }
    await emitBillingStockUpdates(req, stockChanges);
    res.status(201).json(populated);
  } catch (err) {
    res.status(err.status ?? 400).json({ error: err.message });
  } finally {
    await session.endSession();
  }
});

// PATCH update match teams, type, or court
router.patch('/:id', async (req, res) => {
  try {
    const updates = readQueueFields(req.body);
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Provide an editable match field.' });
    }
    const existing = await Match.findOne({ _id: req.params.id, courtId: req.courtId });
    if (!existing) return res.status(404).json({ error: 'Match not found.' });
    const team1 = updates.team1 ?? existing.team1.map(String);
    const team2 = updates.team2 ?? existing.team2.map(String);
    if (!await playerIdsBelongToCourt([...team1, ...team2], req.courtId)) {
      return res.status(400).json({ error: 'Some players are missing or outside court scope.' });
    }
    const match = await Match.findOneAndUpdate(
      { _id: req.params.id, courtId: req.courtId },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!match) return res.status(404).json({ error: 'Match not found.' });
    await match.populate('team1 team2');
    emitCourtEvent(req, 'queue:updated', { action: 'updated', matchId: match._id, status: match.status });
    res.json(match);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST apply the only supported queue status transitions.
router.post('/:id/status', async (req, res) => {
  try {
    const body = readQueueBody(req.body);
    if (Object.keys(body).some(key => key !== 'status')) {
      return res.status(400).json({ error: 'Only status may be provided.' });
    }
    if (typeof body.status !== 'string') {
      return res.status(400).json({ error: 'status must be a string.' });
    }
    const previousStatus = body.status === 'playing'
      ? 'queued'
      : body.status === 'done'
        ? 'playing'
        : null;
    if (!previousStatus) {
      return res.status(400).json({ error: 'Only queued-to-playing and playing-to-done transitions are allowed.' });
    }

    const match = await Match.findOneAndUpdate(
      { _id: req.params.id, courtId: req.courtId, status: previousStatus },
      { $set: { status: body.status } },
      { new: true, runValidators: true }
    );
    if (match) {
      await match.populate('team1 team2');
      emitCourtEvent(req, 'queue:updated', { action: 'updated', matchId: match._id, status: match.status });
      return res.json(match);
    }

    const existing = await Match.findOne({ _id: req.params.id, courtId: req.courtId });
    if (!existing) return res.status(404).json({ error: 'Match not found.' });
    if (existing.status === body.status) {
      await existing.populate('team1 team2');
      return res.json(existing);
    }
    return res.status(409).json({ error: 'Match status has changed or the transition is not allowed.' });
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
        system: 'You are a badminton queue assistant for Kourtly. Review a generated match and explain if it is fair based on player levels and match type. Keep response under 90 words. Give practical, non-hyped reasoning.',
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
    const match = await Match.findOne({ _id: req.params.id, courtId: req.courtId });
    if (match) {
      const allPlayerIds = [...match.team1, ...match.team2];
      await Player.updateMany(
        { _id: { $in: allPlayerIds }, courtId: req.courtId },
        { $inc: { matchCount: -1 } }
      );
      await Match.findOneAndDelete({ _id: req.params.id, courtId: req.courtId });
      emitCourtEvent(req, 'queue:updated', { action: 'deleted', matchId: req.params.id });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;