import crypto from 'node:crypto';
import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../../src/app.js';
import Court from '../../src/models/Court.js';
import Reservation from '../../src/models/Reservation.js';
import SubscriptionPayment from '../../src/models/SubscriptionPayment.js';
import PaymentWebhookEvent from '../../src/models/PaymentWebhookEvent.js';

const MASTER_USER_ID = 'master-user-1';
const MASTER_TOKEN = 'master-callback-token';
const SUB_TOKEN = 'court-callback-token';

function providerResponse(body, ok = true) {
  return { ok, json: async () => body };
}

function invoiceFor(payload, overrides = {}) {
  return {
    id: payload.id,
    external_id: payload.external_id,
    status: payload.status,
    amount: payload.amount ?? payload.paid_amount,
    ...overrides,
  };
}

async function createCourt(slug, subAccountId = 'sub-account-1', token = SUB_TOKEN) {
  return Court.create({
    name: slug,
    slug,
    adminEmail: `${slug}@court.example`,
    isActive: true,
    subscription: { status: 'trial', tier: 'basic' },
    xendit: {
      subAccountId,
      status: 'REGISTERED',
      webhookConfigured: true,
      callbackTokenHash: crypto.createHash('sha256').update(token).digest('hex'),
    },
  });
}

async function createReservation(court, overrides = {}) {
  const reservation = await Reservation.create({
    courtId: court._id,
    name: 'Guest',
    phone: '09170000000',
    court: 1,
    date: '2026-10-10',
    timeSlot: '10:00-11:00',
    duration: 1,
    status: 'approved_waiting_payment',
    paymentStatus: 'awaiting_payment',
    reservationFeeAmount: 500,
    downpaymentAmount: 250,
    maintenanceFeeAmount: 5,
    paymentLinkId: 'invoice-reservation-1',
    paymentExternalId: '',
    paymentExpectedAmount: 255,
    publicRef: 'RSV-TEST-1',
    ...overrides,
  });
  if (!reservation.paymentExternalId) {
    reservation.paymentExternalId = `${reservation._id}-attempt-1`;
    await reservation.save();
  }
  return reservation;
}

function paidPayload({ userId, id, externalId, amount = 255, ...rest }) {
  return {
    user_id: userId,
    id,
    external_id: externalId,
    status: 'PAID',
    amount,
    paid_amount: amount,
    paid_at: '2026-10-10T09:30:00.000Z',
    payment_channel: 'QR_PH',
    payment_method: 'QR_PH',
    payment_id: 'payment-provider-1',
    ...rest,
  };
}

function postWebhook(payload, {
  token = SUB_TOKEN,
  webhookId = 'webhook-event-1',
} = {}) {
  return request(app)
    .post('/api/payments/xendit/webhook')
    .set('x-callback-token', token)
    .set('webhook-id', webhookId)
    .send(payload);
}

describe('Xendit webhook trust split and payment records', () => {
  let previousEnv;

  beforeEach(() => {
    previousEnv = {
      XENDIT_SECRET_KEY: process.env.XENDIT_SECRET_KEY,
      XENDIT_CALLBACK_TOKEN: process.env.XENDIT_CALLBACK_TOKEN,
      XENDIT_MASTER_USER_ID: process.env.XENDIT_MASTER_USER_ID,
    };
    process.env.XENDIT_SECRET_KEY = 'xnd_development_test';
    process.env.XENDIT_CALLBACK_TOKEN = MASTER_TOKEN;
    process.env.XENDIT_MASTER_USER_ID = MASTER_USER_ID;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test('rejects SUB- external IDs on the sub-account path', async () => {
    const court = await createCourt('sub-rejects-subscription');
    const payload = paidPayload({
      userId: court.xendit.subAccountId,
      id: 'invoice-subscription',
      externalId: 'SUB-court-premium-123',
    });

    const response = await postWebhook(payload);

    expect(response.status).toBe(403);
    expect(await SubscriptionPayment.countDocuments()).toBe(0);
    expect(await PaymentWebhookEvent.countDocuments()).toBe(0);
  });

  test('master path cannot complete a reservation with a matching external ID', async () => {
    const court = await createCourt('master-cannot-pay-reservation');
    const reservation = await createReservation(court);

    const response = await postWebhook(paidPayload({
      userId: MASTER_USER_ID,
      id: reservation.paymentLinkId,
      externalId: reservation.paymentExternalId,
    }), { token: MASTER_TOKEN });

    expect(response.status).toBe(403);
    expect((await Reservation.findById(reservation._id).lean()).paymentStatus).toBe('awaiting_payment');
  });

  test('rejects a sub-account token paired with the master user ID', async () => {
    const response = await postWebhook(paidPayload({
      userId: MASTER_USER_ID,
      id: 'invoice-any',
      externalId: 'SUB-any',
    }), { token: SUB_TOKEN });

    expect(response.status).toBe(401);
  });

  test('rejects the master token paired with a sub-account user ID', async () => {
    const court = await createCourt('sub-rejects-master-token');
    const response = await postWebhook(paidPayload({
      userId: court.xendit.subAccountId,
      id: 'invoice-any',
      externalId: 'SUB-any',
    }), { token: MASTER_TOKEN });

    expect(response.status).toBe(401);
  });

  test('rejects a missing or empty Xendit user ID', async () => {
    const response = await postWebhook({
      user_id: '',
      id: 'invoice-without-account',
      external_id: 'SUB-court-premium-123',
      status: 'PAID',
      paid_amount: 255,
    }, { token: MASTER_TOKEN });

    expect(response.status).toBe(400);
  });

  test('rejects a missing invoice ID', async () => {
    const court = await createCourt('missing-invoice-id');
    const response = await postWebhook({
      user_id: court.xendit.subAccountId,
      external_id: 'reservation-attempt',
      status: 'PAID',
      paid_amount: 255,
    });

    expect(response.status).toBe(400);
    expect(await PaymentWebhookEvent.countDocuments()).toBe(0);
  });

  test('does not complete a reservation without a stored invoice ID', async () => {
    const court = await createCourt('missing-stored-invoice-id');
    const reservation = await createReservation(court, { paymentLinkId: '' });
    const response = await postWebhook(paidPayload({
      userId: court.xendit.subAccountId,
      id: 'invoice-not-stored',
      externalId: reservation.paymentExternalId,
    }));

    expect(response.status).toBe(409);
    expect((await Reservation.findById(reservation._id).lean()).paymentStatus).toBe('awaiting_payment');
  });

  test('rejects an amount mismatch against the stored reservation attempt', async () => {
    const court = await createCourt('amount-mismatch');
    const reservation = await createReservation(court);
    const response = await postWebhook(paidPayload({
      userId: court.xendit.subAccountId,
      id: reservation.paymentLinkId,
      externalId: reservation.paymentExternalId,
      amount: 254,
    }));

    expect(response.status).toBe(409);
    expect((await Reservation.findById(reservation._id).lean()).paymentStatus).toBe('awaiting_payment');
  });

  test('rejects an external ID mismatch against the stored reservation attempt', async () => {
    const court = await createCourt('external-id-mismatch');
    const reservation = await createReservation(court);
    const response = await postWebhook(paidPayload({
      userId: court.xendit.subAccountId,
      id: reservation.paymentLinkId,
      externalId: `${reservation._id}-forged`,
    }));

    expect(response.status).toBe(409);
    expect((await Reservation.findById(reservation._id).lean()).paymentStatus).toBe('awaiting_payment');
  });

  test('rejects a reservation whose court differs from the authenticated sub-account', async () => {
    const reservationCourt = await createCourt('reservation-owned-by-first-court', 'sub-account-1');
    const otherCourt = await createCourt('different-account', 'sub-account-2');
    const reservation = await createReservation(reservationCourt);
    const response = await postWebhook(paidPayload({
      userId: otherCourt.xendit.subAccountId,
      id: reservation.paymentLinkId,
      externalId: reservation.paymentExternalId,
    }));

    expect(response.status).toBe(403);
    expect((await Reservation.findById(reservation._id).lean()).paymentStatus).toBe('awaiting_payment');
  });

  test('reconfirms the invoice with for-user-id and records provider payment fields', async () => {
    const court = await createCourt('sub-reconfirmation-success');
    const reservation = await createReservation(court);
    const payload = paidPayload({
      userId: court.xendit.subAccountId,
      id: reservation.paymentLinkId,
      externalId: reservation.paymentExternalId,
    });
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(providerResponse(invoiceFor(payload)));

    const response = await postWebhook(payload);

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][1].headers['for-user-id']).toBe(court.xendit.subAccountId);
    const saved = await Reservation.findById(reservation._id).lean();
    expect(saved).toMatchObject({
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentExternalId: reservation.paymentExternalId,
      paymentChannel: 'QR_PH',
      paymentMethod: 'QR_PH',
      paidAmount: 255,
      paymentId: 'payment-provider-1',
    });
    expect(saved.providerPaidAt.toISOString()).toBe(payload.paid_at);
  });

  test('rejects a reconfirmed invoice mismatch without marking the event processed', async () => {
    const court = await createCourt('sub-reconfirmation-mismatch');
    const reservation = await createReservation(court);
    const payload = paidPayload({
      userId: court.xendit.subAccountId,
      id: reservation.paymentLinkId,
      externalId: reservation.paymentExternalId,
    });
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(providerResponse(invoiceFor(payload, { external_id: 'wrong-external-id' })));

    const response = await postWebhook(payload);

    expect(response.status).toBe(409);
    expect(await PaymentWebhookEvent.countDocuments()).toBe(0);
    expect((await Reservation.findById(reservation._id).lean()).paymentStatus).toBe('awaiting_payment');
  });

  test('returns a retryable response when invoice reconfirmation fails', async () => {
    const court = await createCourt('sub-reconfirmation-transient');
    const reservation = await createReservation(court);
    const payload = paidPayload({
      userId: court.xendit.subAccountId,
      id: reservation.paymentLinkId,
      externalId: reservation.paymentExternalId,
    });
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('temporary provider failure'));

    const response = await postWebhook(payload);

    expect(response.status).toBe(503);
    expect(await PaymentWebhookEvent.countDocuments()).toBe(0);
    expect((await Reservation.findById(reservation._id).lean()).paymentStatus).toBe('awaiting_payment');
  });

  test('master path confirms and applies only a stored subscription payment attempt', async () => {
    const court = await Court.create({
      name: 'Subscription Court',
      slug: 'subscription-court',
      adminEmail: 'subscription@example.com',
      subscription: { status: 'trial', tier: 'basic' },
    });
    const attempt = await SubscriptionPayment.create({
      invoiceId: 'invoice-subscription-attempt',
      externalId: `SUB-${court._id}-standard-123`,
      courtId: court._id,
      tier: 'standard',
      expectedAmount: 1200,
    });
    const payload = paidPayload({
      userId: MASTER_USER_ID,
      id: attempt.invoiceId,
      externalId: attempt.externalId,
      amount: attempt.expectedAmount,
    });
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(providerResponse(invoiceFor(payload)));

    const response = await postWebhook(payload, { token: MASTER_TOKEN });

    expect(response.status).toBe(200);
    expect(fetchSpy.mock.calls[0][1].headers).not.toHaveProperty('for-user-id');
    expect((await Court.findById(court._id).lean()).subscription.tier).toBe('standard');
    expect(await SubscriptionPayment.findById(attempt._id).lean()).toMatchObject({
      status: 'paid',
      paymentChannel: 'QR_PH',
      paymentMethod: 'QR_PH',
      paidAmount: 1200,
      paymentId: 'payment-provider-1',
    });
  });

  test('records a paid event arriving after local cancellation and flags the reservation', async () => {
    const court = await createCourt('late-paid-reservation');
    const reservation = await createReservation(court, {
      status: 'cancelled',
      paymentStatus: 'cancelled',
    });
    const payload = paidPayload({
      userId: court.xendit.subAccountId,
      id: reservation.paymentLinkId,
      externalId: reservation.paymentExternalId,
    });
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(providerResponse(invoiceFor(payload)));

    const response = await postWebhook(payload);

    expect(response.status).toBe(200);
    expect(await Reservation.findById(reservation._id).lean()).toMatchObject({
      status: 'payment_conflict',
      paymentStatus: 'paid',
      paymentReceivedAfterCancellation: true,
      paidAmount: 255,
    });
  });

  test('scopes webhook deduplication by account and permits the same provider event ID on two accounts', async () => {
    const firstCourt = await createCourt('dedupe-first', 'sub-dedupe-first');
    const secondCourt = await createCourt('dedupe-second', 'sub-dedupe-second');
    const firstReservation = await createReservation(firstCourt, {
      paymentLinkId: 'invoice-dedupe-first',
      publicRef: 'RSV-DEDUPE-FIRST',
    });
    const secondReservation = await createReservation(secondCourt, {
      paymentLinkId: 'invoice-dedupe-second',
      publicRef: 'RSV-DEDUPE-SECOND',
    });
    const firstPayload = paidPayload({
      userId: firstCourt.xendit.subAccountId,
      id: firstReservation.paymentLinkId,
      externalId: firstReservation.paymentExternalId,
    });
    const secondPayload = paidPayload({
      userId: secondCourt.xendit.subAccountId,
      id: secondReservation.paymentLinkId,
      externalId: secondReservation.paymentExternalId,
    });
    jest.spyOn(globalThis, 'fetch').mockImplementation(async url => {
      const body = String(url).includes(firstPayload.id) ? firstPayload : secondPayload;
      return providerResponse(invoiceFor(body));
    });

    const first = await postWebhook(firstPayload, { webhookId: 'same-provider-event' });
    const second = await postWebhook(secondPayload, { webhookId: 'same-provider-event' });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await PaymentWebhookEvent.countDocuments({ providerEventId: 'same-provider-event' })).toBe(2);
  });

  test('processes concurrent identical deliveries once', async () => {
    const court = await createCourt('concurrent-delivery');
    const reservation = await createReservation(court);
    const payload = paidPayload({
      userId: court.xendit.subAccountId,
      id: reservation.paymentLinkId,
      externalId: reservation.paymentExternalId,
    });
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(providerResponse(invoiceFor(payload)));

    const [first, second] = await Promise.all([
      postWebhook(payload),
      postWebhook(payload),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses[0]).toBe(200);
    expect([200, 409]).toContain(statuses[1]);
    expect(await Reservation.findById(reservation._id).lean()).toMatchObject({
      status: 'confirmed', paymentStatus: 'paid', paidAmount: 255, adminNetAmount: 250,
    });
  });

  test('allows a provider retry after the payment transaction rolls back', async () => {
    const court = await createCourt('retry-after-rollback');
    const reservation = await createReservation(court);
    const payload = paidPayload({
      userId: court.xendit.subAccountId,
      id: reservation.paymentLinkId,
      externalId: reservation.paymentExternalId,
    });
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(providerResponse(invoiceFor(payload)));
    const eventUpdate = jest.spyOn(PaymentWebhookEvent, 'updateOne').mockImplementationOnce(() => {
      throw new Error('simulated transaction failure');
    });

    const failed = await postWebhook(payload, { webhookId: 'retry-after-rollback' });

    expect(failed.status).toBe(503);
    expect(await PaymentWebhookEvent.countDocuments()).toBe(0);
    expect((await Reservation.findById(reservation._id).lean()).paymentStatus).toBe('awaiting_payment');
    eventUpdate.mockRestore();

    const retried = await postWebhook(payload, { webhookId: 'retry-after-rollback' });

    expect(retried.status).toBe(200);
    expect(await PaymentWebhookEvent.countDocuments()).toBe(1);
    expect((await Reservation.findById(reservation._id).lean()).paymentStatus).toBe('paid');
  });

    function checkPayment(court, reservation) {
    return request(app).post(`/api/public/courts/${court.slug}/reservations/${reservation.publicRef}/check-payment`);
  }

  function paidInvoice(payload, overrides = {}) {
    return invoiceFor(payload, {
      paid_amount: payload.paid_amount,
      paid_at: payload.paid_at,
      payment_channel: 'QR_PH',
      payment_method: 'QR_PH',
      payment_id: 'payment-provider-1',
      ...overrides,
    });
  }

  async function checkSetup(slug, reservationOverrides = {}) {
    const court = await createCourt(slug);
    const reservation = await createReservation(court, reservationOverrides);
    const payload = paidPayload({
      userId: court.xendit.subAccountId,
      id: reservation.paymentLinkId,
      externalId: reservation.paymentExternalId,
    });
    return { court, reservation, payload };
  }

  test('check-payment confirms a paid invoice the webhook missed', async () => {
    const { court, reservation, payload } = await checkSetup('check-paid');
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(providerResponse(paidInvoice(payload)));

    const response = await checkPayment(court, reservation);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ checked: true, status: 'confirmed', paymentStatus: 'paid' });
    expect(fetchSpy.mock.calls[0][1].headers['for-user-id']).toBe(court.xendit.subAccountId);
    expect(await Reservation.findById(reservation._id).lean()).toMatchObject({
      status: 'confirmed', paymentStatus: 'paid', paidAmount: 255, adminNetAmount: 250,
    });
  });

  test('check-payment leaves an unpaid invoice untouched', async () => {
    const { court, reservation, payload } = await checkSetup('check-pending');
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(providerResponse(paidInvoice(payload, { status: 'PENDING' })));

    const response = await checkPayment(court, reservation);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ checked: true, paymentStatus: 'awaiting_payment' });
    expect((await Reservation.findById(reservation._id).lean()).paymentStatus).toBe('awaiting_payment');
  });

  test('check-payment rejects an amount mismatch', async () => {
    const { court, reservation, payload } = await checkSetup('check-mismatch');
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(providerResponse(paidInvoice(payload, { amount: 254, paid_amount: 254 })));

    const response = await checkPayment(court, reservation);

    expect(response.status).toBe(409);
    expect((await Reservation.findById(reservation._id).lean()).paymentStatus).toBe('awaiting_payment');
  });

  test('check-payment is rate limited per reservation', async () => {
    const { court, reservation, payload } = await checkSetup('check-cooldown');
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(providerResponse(paidInvoice(payload, { status: 'PENDING' })));

    const first = await checkPayment(court, reservation);
    const second = await checkPayment(court, reservation);

    expect(first.body.checked).toBe(true);
    expect(second.body.checked).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test('check-payment does not call the provider for an already paid reservation', async () => {
    const { court, reservation, payload } = await checkSetup('check-already-paid', { status: 'confirmed', paymentStatus: 'paid' });
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(providerResponse(paidInvoice(payload)));

    const response = await checkPayment(court, reservation);

    expect(response.status).toBe(200);
    expect(response.body.checked).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('check-payment flags a paid invoice on a locally cancelled reservation', async () => {
    const { court, reservation, payload } = await checkSetup('check-late', { status: 'cancelled', paymentStatus: 'cancelled' });
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(providerResponse(paidInvoice(payload)));

    const response = await checkPayment(court, reservation);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'payment_conflict', paymentStatus: 'paid' });
  });

  test('a webhook after a successful check is a no-op', async () => {
    const { court, reservation, payload } = await checkSetup('check-then-webhook');
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(providerResponse(paidInvoice(payload)));
    await checkPayment(court, reservation);
    const before = (await Reservation.findById(reservation._id).lean()).paidAt;

    const webhook = await postWebhook(payload, { webhookId: 'after-check' });

    expect(webhook.status).toBe(200);
    expect(await PaymentWebhookEvent.countDocuments()).toBe(1);
    expect((await Reservation.findById(reservation._id).lean()).paidAt).toEqual(before);
  });
});
