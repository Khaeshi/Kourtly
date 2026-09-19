import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../../src/app.js';
import Court from '../../src/models/Court.js';
import Reservation from '../../src/models/Reservation.js';
import PaymentWebhookEvent from '../../src/models/PaymentWebhookEvent.js';
import PayoutTransfer from '../../src/models/PayoutTransfer.js';

describe('payment webhook transaction rollback', () => {
  test('rolls back reservation and payout state if a write inside the transaction fails', async () => {
    process.env.XENDIT_CALLBACK_TOKEN = 'test-token';

    const court = await Court.create({
      name: 'Rollback Court',
      slug: 'rollback-court',
      adminEmail: 'rollback@court.com',
      isActive: true,
      subscription: { status: 'active' },
      courtCount: 4,
    });

    const reservation = await Reservation.create({
      courtId: court._id,
      name: 'Guest',
      phone: '09170000000',
      email: 'guest@test.com',
      court: 1,
      date: '2026-04-20',
      timeSlot: '10:00-11:00',
      duration: 1,
      status: 'approved_waiting_payment',
      reservationFeeAmount: 500,
      downpaymentAmount: 250,
      maintenanceFeeAmount: 5,
      paymentLinkId: 'inv-rollback',
      publicRef: 'RSV-ROLLBACK-1',
      paymentStatus: 'awaiting_payment',
    });

    const createSpy = jest
      .spyOn(PayoutTransfer, 'create')
      .mockImplementationOnce(() => {
        throw new Error('SIMULATED_FAILURE');
      });

    const payload = {
      id: 'inv-rollback',
      status: 'PAID',
      external_id: `${reservation._id}-abc`,
      paid_amount: 255,
    };

    const res = await request(app)
      .post('/api/payments/xendit/webhook')
      .set('x-callback-token', 'test-token')
      .send(payload);

    expect(res.status).toBe(500);

    const afterReservation = await Reservation.findById(reservation._id).lean();
    expect(afterReservation.status).toBe('approved_waiting_payment');
    expect(afterReservation.paymentStatus).toBe('awaiting_payment');

    const transfers = await PayoutTransfer.find({ reservationId: reservation._id }).lean();
    expect(transfers).toHaveLength(0);

    const event = await PaymentWebhookEvent.findOne({ eventId: 'inv-rollback' }).lean();
    expect(event.processed).toBe(false);

    createSpy.mockRestore();
  });

  test('concurrent identical webhook deliveries only process once', async () => {
    process.env.XENDIT_CALLBACK_TOKEN = 'test-token';

    const court = await Court.create({
      name: 'Concurrent Court',
      slug: 'concurrent-court',
      adminEmail: 'concurrent@court.com',
      isActive: true,
      subscription: { status: 'active' },
      courtCount: 4,
    });

    const reservation = await Reservation.create({
      courtId: court._id,
      name: 'Guest',
      phone: '09170000000',
      email: 'guest@test.com',
      court: 1,
      date: '2026-04-20',
      timeSlot: '10:00-11:00',
      duration: 1,
      status: 'approved_waiting_payment',
      reservationFeeAmount: 500,
      downpaymentAmount: 250,
      maintenanceFeeAmount: 5,
      paymentLinkId: 'inv-concurrent',
      publicRef: 'RSV-CONCURRENT-1',
      paymentStatus: 'awaiting_payment',
    });

    const payload = {
      id: 'inv-concurrent',
      status: 'PAID',
      external_id: `${reservation._id}-abc`,
      paid_amount: 255,
    };

    const send = () =>
      request(app)
        .post('/api/payments/xendit/webhook')
        .set('x-callback-token', 'test-token')
        .set('webhook-id', 'wh-duplicate-1')
        .send(payload);

    const [first, second] = await Promise.all([send(), send()]);

    console.log('FIRST:', first.status, JSON.stringify(first.body));
    console.log('SECOND:', second.status, JSON.stringify(second.body));

    const statuses = [first.status, second.status].sort();
    expect(statuses[0]).toBe(200);
    expect([200, 409]).toContain(statuses[1]);

    const transfers = await PayoutTransfer.find({ reservationId: reservation._id }).lean();
    expect(transfers).toHaveLength(1);

    const events = await PaymentWebhookEvent.find({ eventId: 'wh-duplicate-1' }).lean();
    expect(events).toHaveLength(1);
  });
});