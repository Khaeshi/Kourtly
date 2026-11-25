import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import Court from '../../src/models/Court.js';
import SubscriptionPayment from '../../src/models/SubscriptionPayment.js';
import Player from '../../src/models/Player.js';
import Reservation from '../../src/models/Reservation.js';
import Tab from '../../src/models/Tab.js';
import Match from '../../src/models/Match.js';

async function makeCourt() {
  return Court.create({
    name: 'Analytics Court',
    slug: `analytics-court-${Date.now()}`,
    adminEmail: 'analytics@court.com',
    isActive: true,
    subscription: { status: 'active', plan: 'monthly', amount: 2000 },
    courtCount: 4,
  });
}

describe('analytics and court routes', () => {
  test('GET /api/analytics/summary returns expected shape', async () => {
    const court = await makeCourt();
    const p1 = await Player.create({ courtId: court._id, name: 'A', level: 'A', gender: 'Male', age: 21 });
    const p2 = await Player.create({ courtId: court._id, name: 'B', level: 'B', gender: 'Female', age: 22 });

    await Reservation.create({
      courtId: court._id,
      name: 'Res One',
      phone: '09170000002',
      court: 1,
      date: '2026-04-01',
      timeSlot: '10:00-11:00',
      duration: 1,
      status: 'confirmed',
    });

    await Tab.create({
      courtId: court._id,
      player: p1._id,
      items: [{ name: 'Drink', price: 40, quantity: 1 }],
      total: 40,
      status: 'paid',
    });

    await Match.create({
      courtId: court._id,
      team1: [p1._id],
      team2: [p2._id],
      matchType: 'XD',
      court: 1,
      status: 'done',
    });

    const res = await request(app)
      .get('/api/analytics/summary?period=month')
      .set('x-court-id', String(court._id));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('reservations');
    expect(res.body).toHaveProperty('billing');
    expect(res.body).toHaveProperty('players');
    expect(res.body).toHaveProperty('queue');
    expect(Array.isArray(res.body.revenueByDay)).toBe(true);
  });

  test('PATCH /api/court/me/subscription is removed and cannot modify billing fields', async () => {
    const court = await makeCourt();
    const before = await Court.findById(court._id).lean();
    for (const role of ['admin', 'staff']) {
      const response = await request(app)
        .patch('/api/court/me/subscription')
        .set('x-court-id', String(court._id))
        .set('x-user-role', role)
        .send({
          plan: 'annual',
          amount: 20000,
          status: 'active',
          nextBilling: '2030-01-01T00:00:00.000Z',
        });

      expect(response.status).toBe(404);
    }

    const after = await Court.findById(court._id).lean();
    expect(after.subscription).toMatchObject({
      plan: before.subscription.plan,
      amount: before.subscription.amount,
      status: before.subscription.status,
    });
    expect(after.subscription.nextBilling).toEqual(before.subscription.nextBilling);
  });

  test('subscription upgrade and downgrade refuse staff', async () => {
    const court = await makeCourt();
    await Court.updateOne(
      { _id: court._id },
      { $set: { 'subscription.tier': 'premium' } },
    );

    const upgrade = await request(app)
      .post('/api/court/me/subscription/upgrade')
      .set('x-court-id', String(court._id))
      .set('x-user-role', 'staff')
      .send({ tier: 'elite' });
    const downgrade = await request(app)
      .post('/api/court/me/subscription/downgrade')
      .set('x-court-id', String(court._id))
      .set('x-user-role', 'staff')
      .send({ tier: 'basic', confirmation: 'Basic' });

    expect(upgrade.status).toBe(403);
    expect(downgrade.status).toBe(403);
    expect(await SubscriptionPayment.countDocuments({ courtId: court._id })).toBe(0);
    const unchanged = await Court.findById(court._id).lean();
    expect(unchanged.subscription.tier).toBe('premium');
    expect(unchanged.subscription.pendingTier).toBeFalsy();
  });

  test('subscription upgrade and downgrade reject protected and unexpected fields', async () => {
    const court = await makeCourt();
    await Court.updateOne(
      { _id: court._id },
      { $set: { 'subscription.tier': 'premium', 'subscription.amount': 5000 } },
    );
    const cases = [
      ['/api/court/me/subscription/upgrade', { tier: 'elite' }],
      ['/api/court/me/subscription/downgrade', { tier: 'basic', confirmation: 'Basic' }],
    ];
    const forbiddenFields = {
      amount: 1,
      status: 'suspended',
      nextBilling: '2030-01-01T00:00:00.000Z',
      plan: 'annual',
      modules: { queue: false },
      subscription: { amount: 1 },
      'subscription.amount': 1,
      $set: { 'subscription.amount': 1 },
      unexpected: true,
    };

    for (const [path, body] of cases) {
      for (const [field, value] of Object.entries(forbiddenFields)) {
        const response = await request(app)
          .post(path)
          .set('x-court-id', String(court._id))
          .set('x-user-role', 'admin')
          .send({ ...body, [field]: value });
        expect(response.status).toBe(400);
      }
    }

    expect(await SubscriptionPayment.countDocuments({ courtId: court._id })).toBe(0);
    const unchanged = await Court.findById(court._id).lean();
    expect(unchanged.subscription).toMatchObject({
      status: 'active',
      tier: 'premium',
      amount: 5000,
    });
    expect(unchanged.subscription.pendingTier).toBeFalsy();
  });

  test('admin can schedule a downgrade without changing the current tier or amount', async () => {
    const nextBilling = new Date('2030-01-01T00:00:00.000Z');
    const court = await makeCourt();
    await Court.updateOne(
      { _id: court._id },
      {
        $set: {
          'subscription.tier': 'premium',
          'subscription.amount': 5000,
          'subscription.nextBilling': nextBilling,
        },
      },
    );

    const response = await request(app)
      .post('/api/court/me/subscription/downgrade')
      .set('x-court-id', String(court._id))
      .set('x-user-role', 'admin')
      .send({ tier: 'basic', confirmation: 'Basic' });

    expect(response.status).toBe(200);
    expect(response.body.pendingTier).toBe('basic');
    expect(new Date(response.body.pendingTierEffectiveAt).toISOString()).toBe(nextBilling.toISOString());
    const updated = await Court.findById(court._id).lean();
    expect(updated.subscription).toMatchObject({
      tier: 'premium',
      amount: 5000,
      pendingTier: 'basic',
    });
  });

  test('subscription upgrade stores the invoice attempt before returning its checkout URL', async () => {
    const previousEnv = {
      PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER,
      XENDIT_SECRET_KEY: process.env.XENDIT_SECRET_KEY,
      APP_BASE_URL: process.env.APP_BASE_URL,
    };
    process.env.PAYMENT_PROVIDER = 'xendit';
    process.env.XENDIT_SECRET_KEY = 'xnd_development_test';
    process.env.APP_BASE_URL = 'https://app.example';
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'subscription-invoice-1', invoice_url: 'https://checkout.example/invoice' }),
    });
    try {
      const court = await Court.create({
        name: 'Subscription Attempt Court',
        slug: 'subscription-attempt-court',
        adminEmail: 'subscription-attempt@example.com',
        isActive: true,
        subscription: { status: 'trial', tier: 'basic' },
      });
      const response = await request(app)
        .post('/api/court/me/subscription/upgrade')
        .set('x-court-id', String(court._id))
        .set('x-user-role', 'admin')
        .send({ tier: 'standard' });

      expect(response.status).toBe(200);
      expect(response.body.paymentId).toBe('subscription-invoice-1');
      expect(await SubscriptionPayment.findOne({ invoiceId: 'subscription-invoice-1' }).lean())
        .toMatchObject({
          externalId: expect.stringMatching(/^SUB-/),
          courtId: court._id,
          tier: 'standard',
          expectedAmount: 3500,
          status: 'pending',
        });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      jest.restoreAllMocks();
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
