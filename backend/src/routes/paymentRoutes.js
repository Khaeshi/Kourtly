import express from 'express';
import Reservation from '../models/Reservation.js';
import ReservationTab from '../models/ReservationTab.js';
import Court from '../models/Court.js';
import PayoutTransfer from '../models/PayoutTransfer.js';
import PaymentWebhookEvent from '../models/PaymentWebhookEvent.js';
import { verifyWebhookSignature } from '../lib/payments/index.js';

const router = express.Router();

function emitCourtEventById(req, courtId, event, payload = {}) {
  const io = req.app.get('io');
  if (!io || !courtId) return;
  io.to(`court:${courtId}`).emit(event, payload);
}

router.post('/cocoart/webhook', async (req, res) => {
  try {
    if (!verifyWebhookSignature(req.body, req.headers)) {
      return res.status(401).json({ error: 'Unauthorized webhook.' });
    }

    const { id, status, external_id, paid_amount } = req.body || {};
    if (!id || !external_id) return res.status(400).json({ error: 'Missing webhook fields.' });

    const existingEvent = await PaymentWebhookEvent.findOne({ eventId: id }).lean();
    if (existingEvent?.processed) return res.json({ ok: true, deduped: true });
    if (!existingEvent) {
      await PaymentWebhookEvent.create({
        eventId: id,
        eventType: String(status || ''),
        processed: false,
      });
    }

    const reservationId = String(external_id).split('-')[0];
    const reservation = await Reservation.findById(reservationId);
    if (!reservation) return res.status(404).json({ error: 'Reservation not found.' });
    if (reservation.paymentLinkId && reservation.paymentLinkId !== id) {
      return res.status(409).json({ error: 'Invoice mismatch.' });
    }
    if (reservation.paymentStatus === 'paid') return res.json({ ok: true, deduped: true });

    if (status === 'PAID' || status === 'SETTLED') {
      const onlinePaid = Number(paid_amount || 0);
      const remaining = Math.max(0, Number(reservation.reservationFeeAmount || 0) - onlinePaid);
      reservation.status = 'confirmed';
      reservation.paymentStatus = 'paid';
      reservation.amountPaidOnline = onlinePaid;
      reservation.remainingBalanceAmount = remaining;
      reservation.adminNetAmount = Math.max(0, onlinePaid - Number(reservation.maintenanceFeeAmount || 0));
      reservation.paidAt = new Date();
      await reservation.save();

      await ReservationTab.findOneAndUpdate(
        { reservation: reservation._id },
        {
          $setOnInsert: {
            reservation: reservation._id,
          },
          $set: {
            courtId: reservation.courtId,
            guestName: reservation.name,
            court: reservation.court,
            date: reservation.date,
            timeSlot: reservation.timeSlot,
            duration: reservation.duration,
            total: remaining,
            status: remaining === 0 ? 'paid' : 'open',
            paymentSummary: {
              reservationFee: Number(reservation.reservationFeeAmount || 0),
              paidOnline: onlinePaid,
              remainingBalance: remaining,
              source: 'cocoart',
            },
          },
        },
        { upsert: true, new: true }
      );

      const transfer = await PayoutTransfer.create({
        courtId: reservation.courtId,
        reservationId: reservation._id,
        recipientCode: '',
        amount: Number(reservation.adminNetAmount || 0),
        status: 'queued',
      });
      const court = await Court.findById(reservation.courtId).lean();
      transfer.recipientCode = court?.payout?.recipientCode || '';
      await transfer.save();
      emitCourtEventById(req, reservation.courtId, 'reservation:updated', {
        action: 'paid',
        reservationId: reservation._id,
      });
      emitCourtEventById(req, reservation.courtId, 'billing:tab_updated', {
        action: 'reservation_synced',
        reservationId: reservation._id,
      });
      emitCourtEventById(req, reservation.courtId, 'analytics:refresh', {
        source: 'payments',
      });
    } else if (status === 'EXPIRED') {
      reservation.status = 'expired';
      reservation.paymentStatus = 'expired';
      await reservation.save();
      emitCourtEventById(req, reservation.courtId, 'reservation:updated', {
        action: 'expired',
        reservationId: reservation._id,
      });
    }

    await PaymentWebhookEvent.updateOne(
      { eventId: id },
      { $set: { processed: true, reservationId: reservation._id, eventType: String(status || '') } }
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

