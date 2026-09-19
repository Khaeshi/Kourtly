import express from 'express';
import mongoose from 'mongoose';
import Reservation from '../models/Reservation.js';
import Court from '../models/Court.js';
import PayoutTransfer from '../models/PayoutTransfer.js';
import PaymentWebhookEvent from '../models/PaymentWebhookEvent.js';
import { verifyWebhookSignature } from '../lib/payments/index.js';
import { transitionReservationPayment } from '../lib/reservationStateMachine.js';
import { TIER_DETAILS } from '../lib/moduleEntitlements.js';

const router = express.Router();

function emitCourtEventById(req, courtId, event, payload = {}) {
  const io = req.app.get('io');
  if (!io || !courtId) return;
  io.to(`court:${courtId}`).emit(event, payload);
}

function emitReservationEvent(req, publicRef, payload = {}) {
  const io = req.app.get('io');
  if (!io || !publicRef) return;
  io.to(`reservation:${publicRef}`).emit('reservation:updated', payload);
}

router.post('/xendit/webhook', async (req, res) => {
  try {
    if (!verifyWebhookSignature(req.body, req.headers)) {
      return res.status(401).json({ error: 'Unauthorized webhook.' });
    }

        const { id, status, external_id, paid_amount, metadata = {} } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Missing webhook fields.' });

    const dedupeKey = req.headers['webhook-id'] || id;

    let alreadyClaimed = false;
    try {
      await PaymentWebhookEvent.create({
        eventId: dedupeKey,
        eventType: String(status || ''),
        processed: false,
      });
    } catch (err) {
      if (err.code === 11000) {
        alreadyClaimed = true;
      } else {
        throw err;
      }
    }

    if (alreadyClaimed) {
      const existing = await PaymentWebhookEvent.findOne({ eventId: dedupeKey }).lean();
      if (existing?.processed) return res.json({ ok: true, deduped: true });
      return res.status(409).json({ error: 'Webhook already being processed, retry.' });
    }

    /**
     * @description Subscription handling: If the webhook metadata indicates that this is a subscription payment, 
     * we update the court's subscription status and relevant fields. 
     * We also mark the webhook event as processed. 
     * This ensures that subscription payments are handled correctly and that the court's subscription 
     * status is accurately reflected in the system.
     */
        if (String(external_id || '').startsWith('SUB-')) {
      const parts = String(external_id).split('-');
      const subCourtId = parts[1];
      const subTier = parts[2];

      if (!subCourtId) {
        return res.status(400).json({ error: 'Malformed subscription external_id.' });
      }

      if (status === 'PAID' || status === 'SETTLED') {
        const now = new Date();
        const nextBilling = new Date(now);
        nextBilling.setDate(nextBilling.getDate() + 30);
        const updatedCourt = await Court.findOneAndUpdate(
          { _id: subCourtId },
          {
            $set: {
              'subscription.status': 'active',
              ...(subTier ? { 'subscription.tier': subTier } : {}),
              ...(subTier && TIER_DETAILS[subTier]?.price ? { 'subscription.amount': TIER_DETAILS[subTier].price } : {}),
              'subscription.pendingTier': null,
              'subscription.pendingTierEffectiveAt': null,
              'subscription.startDate': now,
              'subscription.nextBilling': nextBilling,
            },
          },
          { new: true }
        );
        if (!updatedCourt) {
          console.error(`[webhook] subscription payment ${id} referenced unknown courtId ${subCourtId}`);
        }
      }
      await PaymentWebhookEvent.updateOne(
        { eventId: dedupeKey },
        { $set: { processed: true, eventType: String(status || '') } }
      );
      return res.json({ ok: true, kind: 'subscription' });
    }

    if (!external_id) return res.status(400).json({ error: 'Missing webhook external_id for reservation payment.' });
    const reservationId = String(external_id).split('-')[0];
    const reservation = await Reservation.findById(reservationId);
    if (!reservation) return res.status(404).json({ error: 'Reservation not found.' });
    if (reservation.paymentLinkId && reservation.paymentLinkId !== id) {
      return res.status(409).json({ error: 'Invoice mismatch.' });
    }
    if (reservation.paymentStatus === 'paid') return res.json({ ok: true, deduped: true });


    /**
     * @description PAID or SETTLED status handling: If the invoice has been paid or settled, we transition the reservation's payment status to 'paid' and update relevant fields. We also create a PayoutTransfer for the court's admin. This is done within a MongoDB transaction to ensure atomicity. If any part of the transaction fails, all changes are rolled back to maintain data integrity.
     * @note This is crucial for ensuring that the reservation's payment status accurately reflects the payment state and that the court's admin receives the correct payout. The transaction ensures that either all changes are applied or none, preventing partial updates that could lead to inconsistencies.
     * @see transitionReservationPayment function for state transition logic.
     */
    if (status === 'PAID' || status === 'SETTLED') {
      if (
        !['approved_waiting_payment', 'pending_admin'].includes(reservation.status) ||
        !['awaiting_payment', 'none'].includes(reservation.paymentStatus)
      ) {
        return res.status(409).json({ error: `Cannot mark paid from status "${reservation.status}/${reservation.paymentStatus}".` });
      }

      const onlinePaid = Number(paid_amount || 0);
      const remaining = Math.max(0, Number(reservation.reservationFeeAmount || 0) - onlinePaid);

      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          transitionReservationPayment(reservation, 'confirmed', 'paid');
          reservation.amountPaidOnline = onlinePaid;
          reservation.remainingBalanceAmount = remaining;
          reservation.adminNetAmount = Math.max(0, onlinePaid - Number(reservation.maintenanceFeeAmount || 0));
          reservation.paidAt = new Date();
          await reservation.save({ session });

          const court = await Court.findById(reservation.courtId).session(session).lean();

          await PayoutTransfer.create([{
            courtId: reservation.courtId,
            reservationId: reservation._id,
            recipientCode: court?.payout?.recipientCode || '',
            amount: Number(reservation.adminNetAmount || 0),
            status: 'queued',
          }], { session });

          await PaymentWebhookEvent.updateOne(
            { eventId: dedupeKey },
            { $set: { processed: true, reservationId: reservation._id, eventType: String(status || '') } },
            { session }
          );
        });
      } finally {
        await session.endSession();
      }

      // Emit only after the transaction has committed
      emitCourtEventById(req, reservation.courtId, 'reservation:updated', {
        action: 'paid',
        reservationId: reservation._id,
      });
      emitReservationEvent(req, reservation.publicRef, { action: 'paid', reservationId: reservation._id });
      emitCourtEventById(req, reservation.courtId, 'billing:tab_updated', {
        action: 'reservation_synced',
        reservationId: reservation._id,
      });
      emitCourtEventById(req, reservation.courtId, 'analytics:refresh', {
        source: 'payments',
      });

      return res.json({ ok: true });
    }

    /**
     * @description EXPIRED status handling: If the invoice has expired, we mark the reservation as expired only if it hasn't been paid yet. If it has been paid, we return a 409 conflict error to indicate that the operation is not allowed. This ensures that we don't accidentally expire a reservation that has already been settled.
     * @note This is important for maintaining data integrity and ensuring that the reservation's payment status is accurately reflected in the system.
     * @see transitionReservationPayment function for state transition logic.
     * @see PaymentWebhookEvent model for tracking webhook events and their processing status.
     * @see emitCourtEventById and emitReservationEvent functions for real-time updates to clients.
     */
    if (status === 'EXPIRED') {
      if (reservation.paymentStatus === 'paid') {
        return res.status(409).json({ error: 'Cannot expire an already paid reservation.' });
      }
      transitionReservationPayment(reservation, 'expired', 'expired');
      await reservation.save();
      await PaymentWebhookEvent.updateOne(
        { eventId: dedupeKey },
        { $set: { processed: true, reservationId: reservation._id, eventType: String(status || '') } }
      );
      emitCourtEventById(req, reservation.courtId, 'reservation:updated', {
        action: 'expired',
        reservationId: reservation._id,
      });
      return res.json({ ok: true });
    }
    return res.json({ ok: true, ignored: status });
  } catch (err) {
    if (String(err.message || '').includes('Invalid reservation status transition') ||
        String(err.message || '').includes('Invalid payment status transition')) {
      return res.status(409).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

export default router;

