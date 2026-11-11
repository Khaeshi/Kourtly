import express from 'express';
import mongoose from 'mongoose';
import { generateAIText } from '../lib/ai/index.js';
import { buildAnalyticsSummary } from '../services/analyticsSummary.js';

const router = express.Router();
const DAILY_AI_LIMIT = 10;
const PERIODS = new Set(['today', 'week', 'month', 'year']);

function requireAdmin(req, res) {
  if (!['admin', 'superadmin'].includes(req.userRole)) {
    res.status(403).json({ error: 'Admin access required.' });
    return false;
  }
  return true;
}

function courtTimeZone(req) {
  const timezone = req.court?.settings?.timezone || 'Asia/Manila';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return timezone;
  } catch {
    return 'Asia/Manila';
  }
}

async function consumeAnalyticsAskQuota(courtId, timeZone) {
  const Court = mongoose.model('Court');
  const key = new Date().toLocaleDateString('en-CA', { timeZone });
  const court = await Court.findOneAndUpdate(
    { _id: courtId },
    {
      $setOnInsert: {},
      $set: { updatedAt: new Date() },
    },
    { new: true }
  ).lean();

  const quota = court?.analyticsAskQuota || {};
  let day = quota.day || '';
  let count = Number(quota.count || 0);
  if (day !== key) {
    day = key;
    count = 0;
  }
  if (count >= DAILY_AI_LIMIT) return false;

  await Court.updateOne(
    { _id: courtId },
    { $set: { analyticsAskQuota: { day, count: count + 1 } } }
  );
  return true;
}

async function summaryForRequest(req, period) {
  return buildAnalyticsSummary(req.courtId, period, {
    timezone: courtTimeZone(req),
    courtCount: req.court?.courtCount,
  });
}

router.get('/summary', async (req, res) => {
  try {
    const period = req.query.period ?? 'week';
    if (!PERIODS.has(period)) {
      return res.status(400).json({ error: 'period must be today, week, month, or year.' });
    }
    const summary = await summaryForRequest(req, period);
    res.json(summary);
  } catch (err) {
    console.error('[analytics]', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/ask', async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { question = '', period = 'week' } = req.body || {};
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'question is required' });
    }
    if (!PERIODS.has(period)) {
      return res.status(400).json({ error: 'period must be today, week, month, or year.' });
    }

    const timezone = courtTimeZone(req);
    const allowed = await consumeAnalyticsAskQuota(req.courtId, timezone);
    if (!allowed) {
      return res.status(429).json({ error: `You've used your ${DAILY_AI_LIMIT} daily AI queries. Try again tomorrow.` });
    }

    const dataUsed = await summaryForRequest(req, period);
    try {
      const answer = await generateAIText({
        maxTokens: 260,
        system: "You are an analytics assistant for Kourtly court managers in the Philippines. You receive an analytics summary for their court. Answer directly using the provided data, cite numbers and dates, say clearly if the data does not answer the question, and keep answers under 120 words. Taglish questions are fine; answer in plain English. Never suggest features that do not exist.",
        prompt: `Question: ${question}\n\nAnalytics data:\n${JSON.stringify(dataUsed)}`,
      });
      if (!answer) throw new Error('Empty AI answer');
      return res.json({ answer, dataUsed });
    } catch (err) {
      console.error('[analytics] AI response failed:', err);
      return res.json({
        answer: 'AI unavailable — check the charts above.',
        dataUsed,
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
