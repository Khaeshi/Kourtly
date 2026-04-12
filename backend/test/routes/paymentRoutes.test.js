import request from 'supertest';
import app from '../../src/app.js';
import Court from '../../src/models/Court.js';
import Reservation from '../../src/models/Reservation.js';
import PaymentWebhookEvent from '../../src/models/PaymentWebhookEvent.js';
import PayoutTransfer from '../../src/models/PayoutTransfer.js';

describe('payment webhook routes', () => {
  test('dedupes repeated xendit webhook events by event id', async () => {
    process.env.XENDIT_WEBHOOK_TOKEN = 'test-token';

    const court = await Court.create({
      name: 'Webhook Court',
      slug: 'webhook-court',
      adminEmail: 'webhook@court.com',
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
      xenditInvoiceId: 'inv-1',
      publicRef: 'RSV-TEST-1',
      paymentStatus: 'awaiting_payment',
    });

    const payload = {
      id: 'inv-1',
      status: 'PAID',
      external_id: `${reservation._id}-abc`,
      paid_amount: 255,
    };

    const first = await request(app)
      .post('/api/payments/xendit/webhook')
      .set('x-callback-token', 'test-token')
      .send(payload);
    expect(first.status).toBe(200);

    const second = await request(app)
      .post('/api/payments/xendit/webhook')
      .set('x-callback-token', 'test-token')
      .send(payload);
    expect(second.status).toBe(200);
    expect(second.body.deduped).toBe(true);

    const events = await PaymentWebhookEvent.find({ eventId: 'inv-1' }).lean();
    expect(events).toHaveLength(1);
    expect(events[0].processed).toBe(true);

    const updated = await Reservation.findById(reservation._id).lean();
    expect(updated.status).toBe('confirmed');
    expect(updated.paymentStatus).toBe('paid');

    const transfers = await PayoutTransfer.find({ reservationId: reservation._id }).lean();
    expect(transfers).toHaveLength(1);
  });
});

