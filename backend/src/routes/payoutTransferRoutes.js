import express from 'express';
import PayoutTransfer from '../models/PayoutTransfer.js';
import Court from '../models/Court.js';
import { createDisbursement } from '../services/xenditService.js';

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
  try {
    const transfer = await PayoutTransfer.findOne({ _id: req.params.id, courtId: req.courtId });
    if (!transfer) return res.status(404).json({ error: 'Transfer not found.' });
    if (transfer.status === 'succeeded') return res.status(400).json({ error: 'Transfer already succeeded.' });

    const court = await Court.findById(req.courtId).lean();
    const recipientCode = court?.payout?.recipientCode || transfer.recipientCode;
    if (!recipientCode) return res.status(400).json({ error: 'No configured recipient code.' });

    const dis = await createDisbursement({
      externalId: `retry-${transfer._id}-${Date.now()}`,
      amount: transfer.amount,
      recipientCode,
      description: `Retry payout ${transfer.reservationId}`,
    });

    transfer.status = 'succeeded';
    transfer.recipientCode = recipientCode;
    transfer.xenditDisbursementId = dis.id || transfer.xenditDisbursementId;
    transfer.failureReason = '';
    await transfer.save();
    res.json(transfer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

