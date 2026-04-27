const RESERVATION_TRANSITIONS = {
  pending: ['confirmed', 'expired'],
  pending_admin: ['approved_waiting_payment', 'cancelled'],
  approved_waiting_payment: ['confirmed', 'expired', 'cancelled'],
  payment_processing: ['payment_received', 'payment_conflict', 'refund_required'],
  payment_received: ['confirmed'],
  payment_conflict: ['refund_required', 'cancelled'],
  refund_required: ['cancelled'],
  confirmed: ['completed', 'cancelled'],
  expired: [],
  cancelled: [],
  completed: [],
};

const PAYMENT_TRANSITIONS = {
  none: ['awaiting_payment', 'cancelled'],
  awaiting_payment: ['paid', 'expired', 'cancelled', 'failed'],
  paid: [],
  expired: [],
  failed: ['awaiting_payment', 'cancelled'],
  cancelled: [],
};

function canTransition(map, from, to) {
  const allowed = map[from] || [];
  return allowed.includes(to);
}

export function assertReservationTransition(from, to) {
  if (from === to) return;
  if (!canTransition(RESERVATION_TRANSITIONS, from, to)) {
    throw new Error(`Invalid reservation status transition: ${from} -> ${to}`);
  }
}

export function assertPaymentTransition(from, to) {
  if (from === to) return;
  if (!canTransition(PAYMENT_TRANSITIONS, from, to)) {
    throw new Error(`Invalid payment status transition: ${from} -> ${to}`);
  }
}

export function transitionReservationPayment(reservation, nextReservationStatus, nextPaymentStatus) {
  if (nextReservationStatus) {
    assertReservationTransition(reservation.status, nextReservationStatus);
  }
  if (nextPaymentStatus) {
    assertPaymentTransition(reservation.paymentStatus, nextPaymentStatus);
  }

  if (nextReservationStatus) reservation.status = nextReservationStatus;
  if (nextPaymentStatus) reservation.paymentStatus = nextPaymentStatus;
}
