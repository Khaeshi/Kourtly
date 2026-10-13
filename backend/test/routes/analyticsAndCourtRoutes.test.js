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

  test('PATCH /api/court/me/subscription blocks non-annual request', async () => {
    const court = await makeCourt();
    const res = await request(app)
      .patch('/api/court/me/subscription')
      .set('x-court-id', String(court._id))
      .send({ plan: 'monthly' });

    expect(res.status).toBe(403);
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
