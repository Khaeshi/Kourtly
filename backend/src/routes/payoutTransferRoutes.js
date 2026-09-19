import express from 'express';
import PayoutTransfer from '../models/PayoutTransfer.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const status = String(req.query.status || 'all');
    const query = { courtId: req.courtId };
    if (status !== 'all') query.status = status;
    const transfers = await PayoutTransfer.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json(transfers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/retry', async (req, res) => {
  return res.status(501).json({
    error: 'Automatic payout retry is not yet implemented.',
  });
});

export default router;

