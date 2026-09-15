import Reservation from '../models/Reservation.js';
import { assertReservationTransition, assertPaymentTransition } from '../lib/reservationStateMachine.js';

const JOB_INTERVAL_MS = 2 * 60 * 1000;

export function startExpirePendingPaymentsJob(io) {
  const run = async () => {
    const now = new Date();
    const expired = await Reservation.find({
      status: 'approved_waiting_payment',
      paymentStatus: 'awaiting_payment',
      paymentExpiresAt: { $lte: now },
    }).select('_id courtId');

    for (const reservation of expired) {
      assertReservationTransition('approved_waiting_payment', 'expired');
      assertPaymentTransition('awaiting_payment', 'expired');
      const updated = await Reservation.findOneAndUpdate(
        {
          _id: reservation._id,
          status: 'approved_waiting_payment',
          paymentStatus: 'awaiting_payment',
          paymentExpiresAt: { $lte: now },
        },
          { $set: { status: 'expired', paymentStatus: 'expired' }, $unset: { bookingSlots: 1 } },
        { new: true }
      ).lean();

      if (!updated || !io) continue;
      io.to(`court:${updated.courtId}`).emit('reservation:updated', {
        action: 'expired',
        reservationId: updated._id,
      });
      io.to(`court:${updated.courtId}`).emit('analytics:refresh', {
        source: 'payments',
      });
    }
  };

  const timer = setInterval(() => {
    run().catch((err) => {
      console.error('[jobs] expirePendingPayments failed:', err.message);
    });
  }, JOB_INTERVAL_MS);

  timer.unref?.();
  run().catch((err) => {
    console.error('[jobs] expirePendingPayments startup run failed:', err.message);
  });
}
