import Reservation from '../models/Reservation.js';
import { transitionReservationPayment } from './reservationStateMachine.js';

export function webhookError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function validAmount(value, expected) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount === Number(expected);
}

// Applies a provider-confirmed payment inside an open transaction.
// Returns null when the reservation is already paid (safe no-op).
export async function applyReservationPayment({ session, accountCourtId, invoiceId, externalId, payment }) {
  const paidReservation = await Reservation.findOne({
    paymentLinkId: invoiceId,
    paymentExternalId: externalId,
  }).session(session);
  if (!paidReservation || String(paidReservation.courtId) !== String(accountCourtId)) {
    throw webhookError(409, 'Payment account does not match the reservation venue.');
  }
  if (paidReservation.paymentStatus === 'paid') return null;

  const paidAt = new Date(payment.paidAt);
  if (Number.isNaN(paidAt.getTime())) throw webhookError(400, 'Invalid provider payment timestamp.');
  const onlinePaid = Number(payment.amount);
  const isLate = ['cancelled', 'expired'].includes(paidReservation.status) ||
    ['cancelled', 'expired'].includes(paidReservation.paymentStatus);
  if (isLate) {
    paidReservation.status = 'payment_conflict';
    paidReservation.paymentStatus = 'paid';
    paidReservation.paymentReceivedAfterCancellation = true;
  } else if (
    ['approved_waiting_payment', 'pending_admin'].includes(paidReservation.status) &&
    ['awaiting_payment', 'none'].includes(paidReservation.paymentStatus)
  ) {
    transitionReservationPayment(paidReservation, 'confirmed', 'paid');
  } else {
    throw webhookError(409, 'Reservation is not in a payable state.');
  }

  paidReservation.amountPaidOnline = onlinePaid;
  paidReservation.remainingBalanceAmount = Math.max(0, Number(paidReservation.reservationFeeAmount || 0) - onlinePaid);
  paidReservation.adminNetAmount = Math.max(0, onlinePaid - Number(paidReservation.maintenanceFeeAmount || 0));
  paidReservation.paidAt = paidAt;
  paidReservation.providerPaidAt = paidAt;
  paidReservation.paymentChannel = String(payment.channel || '');
  paidReservation.paymentMethod = String(payment.method || '');
  paidReservation.paidAmount = onlinePaid;
  paidReservation.paymentId = String(payment.paymentId || '');
  await paidReservation.save({ session });

  return {
    _id: paidReservation._id,
    courtId: paidReservation.courtId,
    publicRef: paidReservation.publicRef,
    paymentReceivedAfterCancellation: paidReservation.paymentReceivedAfterCancellation,
  };
}