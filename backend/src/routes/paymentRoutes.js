import express from 'express';
import mongoose from 'mongoose';
import Court from '../models/Court.js';
import Reservation from '../models/Reservation.js';
import SubscriptionPayment from '../models/SubscriptionPayment.js';
import PaymentWebhookEvent from '../models/PaymentWebhookEvent.js';
import { applyReservationPayment, validAmount, webhookError } from '../lib/reservationPayment.js';
import {
  getXenditInvoice,
  isSubAccountWebhookAuthorized,
  isXenditWebhookAuthorized,
} from '../services/xenditService.js';
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


async function reconfirmInvoice(invoiceId, externalId, callbackStatus, expectedAmount, subAccountId) {
  let invoice;
  try {
    invoice = await getXenditInvoice(invoiceId, subAccountId);
  } catch {
    throw webhookError(503, 'Invoice confirmation unavailable; retry the webhook.');
  }
  if (
    invoice?.id !== invoiceId ||
    invoice?.external_id !== externalId ||
    !['PAID', 'SETTLED'].includes(invoice?.status) ||
    !validAmount(invoice?.amount, expectedAmount)
  ) {
    throw webhookError(409, 'Xendit invoice confirmation did not match the payment attempt.');
  }
}

router.post('/xendit/webhook', async (req, res) => {
  let session;
  try {
    const { user_id: userId, id, external_id: externalId, status, paid_amount: paidAmount } = req.body || {};
    if (typeof userId !== 'string' || !userId.trim()) {
      return res.status(400).json({ error: 'Missing Xendit account ID.' });
    }
    if (typeof id !== 'string' || !id || typeof externalId !== 'string' || !externalId) {
      return res.status(400).json({ error: 'Missing invoice ID or external ID.' });
    }
    const webhookId = req.headers['webhook-id'];
    if (typeof webhookId !== 'string' || !webhookId.trim()) {
      return res.status(400).json({ error: 'Missing webhook ID.' });
    }

    const masterUserId = process.env.XENDIT_MASTER_USER_ID;
    if (!masterUserId) {
      return res.status(503).json({ error: 'Xendit webhook account is not configured.' });
    }
    const isMasterAccount = userId === masterUserId;
    let accountCourt = null;
    if (isMasterAccount) {
      if (!isXenditWebhookAuthorized(req.headers)) {
        return res.status(401).json({ error: 'Unauthorized webhook.' });
      }
      if (!externalId.startsWith('SUB-')) {
        return res.status(403).json({ error: 'Master account events cannot complete reservation payments.' });
      }
    } else {
      accountCourt = await Court.findOne({ 'xendit.subAccountId': userId })
        .select('_id +xendit.callbackTokenHash')
        .lean();
      if (!accountCourt || !isSubAccountWebhookAuthorized(req.headers['x-callback-token'], accountCourt.xendit?.callbackTokenHash)) {
        return res.status(401).json({ error: 'Unauthorized webhook.' });
      }
      if (externalId.startsWith('SUB-')) {
        console.warn('[webhook] rejected subscription external ID on sub-account path');
        return res.status(403).json({ error: 'Sub-account events cannot complete subscription payments.' });
      }
    }
    if (!['PAID', 'SETTLED'].includes(status)) {
      return res.json({ ok: true, ignored: true });
    }

    let reservation = null;
    let subscriptionPayment = null;
    let expectedAmount;
    if (isMasterAccount) {
      subscriptionPayment = await SubscriptionPayment.findOne({ invoiceId: id, externalId }).lean();
      if (!subscriptionPayment) {
        return res.status(409).json({ error: 'No matching subscription payment attempt.' });
      }
      expectedAmount = subscriptionPayment.expectedAmount;
    } else {
      reservation = await Reservation.findOne({ paymentLinkId: id, paymentExternalId: externalId }).lean();
      if (!reservation) {
        return res.status(409).json({ error: 'No matching reservation payment attempt.' });
      }
      if (String(reservation.courtId) !== String(accountCourt._id)) {
        return res.status(403).json({ error: 'Payment account does not match the reservation venue.' });
      }
      expectedAmount = reservation.paymentExpectedAmount;
    }

    if (
      !Number.isFinite(Number(expectedAmount)) ||
      Number(expectedAmount) <= 0 ||
      !validAmount(paidAmount, expectedAmount)
    ) {
      return res.status(409).json({ error: 'Paid amount does not match the stored payment attempt.' });
    }
    await reconfirmInvoice(id, externalId, status, expectedAmount, isMasterAccount ? undefined : userId);

    const resolvedEventId = JSON.stringify([userId, webhookId]);
    session = await mongoose.startSession();
    let reservationResult = null;
    await session.withTransaction(async () => {
      await PaymentWebhookEvent.create([{
        eventId: resolvedEventId,
        accountId: userId,
        providerEventId: webhookId,
        eventType: status,
        processed: false,
      }], { session });

      if (isMasterAccount) {
        const attempt = await SubscriptionPayment.findOne({ invoiceId: id, externalId }).session(session);
        if (!attempt) throw webhookError(409, 'No matching subscription payment attempt.');
        if (attempt.status !== 'paid') {
          const court = await Court.findById(attempt.courtId).session(session);
          if (!court) throw webhookError(409, 'Subscription payment references an unknown venue.');
          const now = new Date(req.body.paid_at);
          if (Number.isNaN(now.getTime())) throw webhookError(400, 'Invalid provider payment timestamp.');
          attempt.status = 'paid';
          attempt.providerPaidAt = now;
          attempt.paymentChannel = String(req.body.payment_channel || '');
          attempt.paymentMethod = String(req.body.payment_method || '');
          attempt.paidAmount = Number(paidAmount);
          attempt.paymentId = String(req.body.payment_id || '');
          await attempt.save({ session });

          const nextBilling = new Date(now);
          nextBilling.setDate(nextBilling.getDate() + 30);
          court.subscription.status = 'active';
          court.subscription.tier = attempt.tier;
          court.subscription.amount = TIER_DETAILS[attempt.tier]?.price || attempt.expectedAmount;
          court.subscription.pendingTier = null;
          court.subscription.pendingTierEffectiveAt = null;
          court.subscription.startDate = now;
          court.subscription.nextBilling = nextBilling;
          await court.save({ session });
        }
      } else {
          reservationResult = await applyReservationPayment({
          session,
          accountCourtId: accountCourt._id,
          invoiceId: id,
          externalId,
          payment: {
            amount: paidAmount,
            paidAt: req.body.paid_at,
            channel: req.body.payment_channel,
            method: req.body.payment_method,
            paymentId: req.body.payment_id,
          },
        });
      }

      await PaymentWebhookEvent.updateOne(
        { eventId: resolvedEventId },
        {
          $set: {
            processed: true,
            ...(reservationResult ? { reservationId: reservationResult._id } : {}),
            eventType: status,
          },
        },
        { session },
      );
    });

    if (reservationResult) {
      const eventPayload = {
        action: reservationResult.paymentReceivedAfterCancellation ? 'payment_conflict' : 'paid',
        reservationId: reservationResult._id,
        paymentReceivedAfterCancellation: reservationResult.paymentReceivedAfterCancellation,
      };
      emitCourtEventById(req, reservationResult.courtId, 'reservation:updated', eventPayload);
      emitReservationEvent(req, reservationResult.publicRef, eventPayload);
      emitCourtEventById(req, reservationResult.courtId, 'billing:tab_updated', {
        action: 'reservation_synced',
        reservationId: reservationResult._id,
      });
      emitCourtEventById(req, reservationResult.courtId, 'analytics:refresh', { source: 'payments' });
    }
    return res.json({ ok: true, kind: isMasterAccount ? 'subscription' : 'reservation' });
  } catch (error) {
    if (error?.code === 11000) {
      const event = await PaymentWebhookEvent.findOne({
        eventId: JSON.stringify([req.body?.user_id, req.headers['webhook-id']]),
      }).lean();
      if (event?.processed) return res.json({ ok: true, deduped: true });
      return res.status(409).json({ error: 'Webhook delivery is already being processed; retry.' });
    }
    if (error?.status) return res.status(error.status).json({ error: error.message });
    return res.status(503).json({ error: 'Webhook processing failed; retry the delivery.' });
  } finally {
    if (session) await session.endSession();
  }
});

export default router;
