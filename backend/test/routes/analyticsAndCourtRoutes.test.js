import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../src/app.js';
import Court from '../../src/models/Court.js';
import SubscriptionPayment from '../../src/models/SubscriptionPayment.js';
import Player from '../../src/models/Player.js';
import Reservation from '../../src/models/Reservation.js';
import ReservationTab from '../../src/models/ReservationTab.js';
import ScheduleBlock from '../../src/models/ScheduleBlock.js';
import ScheduleRule from '../../src/models/ScheduleRule.js';
import Item from '../../src/models/Item.js';
import StockMovement from '../../src/models/StockMovement.js';
import Tab from '../../src/models/Tab.js';
import Match from '../../src/models/Match.js';

async function makeCourt() {
  return Court.create({
    name: 'Analytics Court',
    slug: `analytics-court-${Date.now()}`,
    adminEmail: 'analytics@court.com',
    isActive: true,
    registrationStatus: 'approved',
    subscription: { status: 'active', plan: 'monthly', amount: 2000 },
    courtCount: 8,
    settings: { timezone: 'Asia/Manila', monthlyRevenueGoal: 50000 },
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
    expect(res.body.courtUtilization).toHaveLength(8);
    expect(res.body).toHaveProperty('comparison');
    expect(res.body).toHaveProperty('payments');
    expect(res.body.monthlyRevenueGoal).toBe(50000);
  });

  test('summary uses court-local dates and includes reservation-tab sales and stock projections', async () => {
    const court = await makeCourt();
    const now = new Date();
    const today = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
    const player = await Player.create({
      courtId: court._id, name: 'Paid Player', level: 'A', gender: 'Male', age: 24,
    });
    await ScheduleRule.create({
      courtId: court._id, dayOfWeek: weekday, isClosed: false, openTime: '09:00', closeTime: '11:00',
    });
    await ScheduleBlock.create({
      courtId: court._id, date: today, courts: [8], blockType: 'day',
    });
    const reservation = await Reservation.create({
      courtId: court._id,
      name: 'Online Guest',
      phone: '09170000002',
      court: 1,
      date: today,
      timeSlot: '09:00-10:00',
      duration: 1,
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentMethod: 'online',
      reservationFeeAmount: 500,
      amountPaidOnline: 250,
      paidAmount: 250,
      paidAt: now,
    });
    const item = await Item.create({
      courtId: court._id, name: 'Shuttlecock', price: 10, isActive: true,
      trackStock: true, stockOnHand: 2, lowStockThreshold: 3,
    });
    await StockMovement.create({
      courtId: court._id, itemId: item._id, type: 'sale', quantityDelta: -1,
      balanceAfter: 2, unitPrice: 10, note: 'Test sale', actorId: 'staff',
      idempotencyKey: 'analytics-today-sale', requestHash: 'analytics-today-sale',
    });
    await Tab.create({
      courtId: court._id,
      player: player._id,
      items: [{ item: item._id, name: 'Shuttlecock', price: 20, quantity: 1 }],
      total: 20,
      status: 'paid',
    });
    await ReservationTab.create({
      courtId: court._id,
      reservation: reservation._id,
      guestName: 'Online Guest',
      court: 1,
      date: today,
      timeSlot: '09:00-10:00',
      duration: 1,
      items: [{ item: item._id, name: 'Shuttlecock', price: 10, quantity: 1 }],
      total: 260,
      status: 'paid',
      paymentSummary: {
        reservationFee: 500,
        paidOnline: 250,
        paidCourtFee: 250,
        remainingBalance: 0,
      },
    });

    const res = await request(app)
      .get('/api/analytics/summary?period=today')
      .set('x-court-id', String(court._id));

    expect(res.status).toBe(200);
    expect(res.body.timezone).toBe('Asia/Manila');
    expect(res.body.dateRange).toEqual({ start: today, end: today });
    expect(res.body.courtUtilization).toHaveLength(8);
    expect(res.body.todayUtilization).toEqual({ bookedHours: 1, openHours: 14, bookedShare: 0.0714 });
    expect(res.body.payments).toEqual({ online: 250, counter: 280, courtFees: 500, items: 30 });
    expect(res.body.billing.combinedRevenue).toBe(530);
    expect(res.body.topItems).toEqual([
      expect.objectContaining({ itemId: String(item._id), name: 'Shuttlecock', quantity: 2, revenue: 30 }),
    ]);
    expect(res.body.lowStockItems).toEqual([
      expect.objectContaining({ itemId: String(item._id), stockOnHand: 2, lowStockThreshold: 3, soldToday: 1 }),
    ]);
  });

  test('summary does not count a counter-paid walk-in reservation twice through its billing tab', async () => {
    const court = await makeCourt();
    const now = new Date();
    const reservation = await Reservation.create({
      courtId: court._id,
      name: 'Counter Guest',
      phone: '09170000003',
      court: 1,
      date: now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }),
      timeSlot: '10:00-11:00',
      duration: 1,
      status: 'confirmed',
      paymentStatus: 'paid',
      paymentMethod: 'counter',
      paymentChannel: 'counter',
      reservationFeeAmount: 500,
      paidAmount: 500,
      paidAt: now,
    });
    await ReservationTab.create({
      courtId: court._id,
      reservation: reservation._id,
      guestName: reservation.name,
      court: 1,
      date: reservation.date,
      timeSlot: reservation.timeSlot,
      duration: 1,
      items: [],
      total: 0,
      status: 'paid',
      paymentSummary: {
        reservationFee: 500,
        paidOnline: 0,
        paidCourtFee: 0,
        remainingBalance: 0,
      },
    });

    const response = await request(app)
      .get('/api/analytics/summary?period=today')
      .set('x-court-id', String(court._id));

    expect(response.status).toBe(200);
    expect(response.body.payments).toEqual({ online: 0, counter: 500, courtFees: 500, items: 0 });
    expect(response.body.billing.combinedRevenue).toBe(500);
  });

  test('tenant middleware permits only status read and rejected resubmission before approval', async () => {
    const pending = await Court.create({
      name: 'Pending Gate Court', slug: 'pending-gate-court', adminEmail: 'pending-gate@court.com',
      registrationStatus: 'pending', subscription: { status: 'pending' },
    });

    const status = await request(app)
      .get('/api/court/me')
      .set('x-court-id', String(pending._id))
      .set('x-user-role', 'admin');
    const analytics = await request(app)
      .get('/api/analytics/summary?period=today')
      .set('x-court-id', String(pending._id))
      .set('x-user-role', 'admin');
    const resubmit = await request(app)
      .patch('/api/court/me/registration')
      .set('x-court-id', String(pending._id))
      .set('x-user-role', 'admin')
      .send({});

    expect(status.status).toBe(200);
    expect(analytics.status).toBe(403);
    expect(analytics.body.error).toMatch(/awaiting approval/i);
    expect(resubmit.status).toBe(403);
  });

  test('legacy courts without registrationStatus use subscription status for approval', async () => {
    const approvedId = new mongoose.Types.ObjectId();
    const pendingId = new mongoose.Types.ObjectId();
    await Court.collection.insertMany([
      {
        _id: approvedId, name: 'Legacy Active', slug: 'legacy-active',
        adminEmail: 'legacy-active@court.com', isActive: true,
        subscription: { status: 'active' },
      },
      {
        _id: pendingId, name: 'Legacy Pending', slug: 'legacy-pending',
        adminEmail: 'legacy-pending@court.com', isActive: true,
        subscription: { status: 'pending' },
      },
    ]);

    const approved = await request(app)
      .get('/api/analytics/summary?period=today')
      .set('x-court-id', String(approvedId));
    const pending = await request(app)
      .get('/api/analytics/summary?period=today')
      .set('x-court-id', String(pendingId));

    expect(approved.status).toBe(200);
    expect(pending.status).toBe(403);
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

  test('PATCH /api/court/me validates and saves the monthly revenue goal', async () => {
    const court = await makeCourt();
    const invalid = await request(app)
      .patch('/api/court/me')
      .set('x-court-id', String(court._id))
      .set('x-user-role', 'admin')
      .send({ settings: { monthlyRevenueGoal: -1 } });
    expect(invalid.status).toBe(400);

    const valid = await request(app)
      .patch('/api/court/me')
      .set('x-court-id', String(court._id))
      .set('x-user-role', 'admin')
      .send({
        settings: { monthlyRevenueGoal: 75000 },
        futureProfileField: 'ignored',
        subscription: {
          plan: 'annual',
          amount: 20000,
          status: 'suspended',
          nextBilling: '2030-01-01T00:00:00.000Z',
          modules: { queue: false },
        },
      });
    expect(valid.status).toBe(200);
    expect(valid.body.settings.monthlyRevenueGoal).toBe(75000);
    const unchangedSubscription = await Court.findById(court._id).select('subscription').lean();
    expect(unchangedSubscription.subscription).toMatchObject({
      plan: 'monthly',
      amount: 2000,
      status: 'active',
    });
  });

  test('GET /api/court/me exposes registration status and rejection reason', async () => {
    const court = await Court.create({
      name: 'Rejected Court',
      slug: 'rejected-court',
      adminEmail: 'rejected@court.com',
      registrationStatus: 'rejected',
      rejectionReason: 'Please confirm your location pin.',
      subscription: { status: 'pending' },
    });

    const res = await request(app)
      .get('/api/court/me')
      .set('x-court-id', String(court._id))
      .set('x-user-role', 'admin');

    expect(res.status).toBe(200);
    expect(res.body.registrationStatus).toBe('rejected');
    expect(res.body.rejectionReason).toBe('Please confirm your location pin.');
  });

  test('PATCH /api/court/me/registration resubmits the same rejected court', async () => {
    const court = await Court.create({
      name: 'Rejected Court',
      slug: 'rejected-court',
      adminEmail: 'rejected@court.com',
      registrationStatus: 'rejected',
      rejectionReason: 'Please confirm your location pin.',
      subscription: { status: 'pending', trialEnds: null },
    });
    const res = await request(app)
      .patch('/api/court/me/registration')
      .set('x-court-id', String(court._id))
      .set('x-user-role', 'admin')
      .send({
        name: 'Updated Court',
        slug: 'updated-court',
        sports: ['badminton', 'pickleball'],
        courtCount: 8,
        location: { city: 'Biñan', province: 'Laguna', address: 'Court St.', lat: 14.33, lng: 121.08 },
        contact: { phone: '09171234567', email: 'hello@example.com' },
        contactPerson: { name: 'Juan Dela Cruz', phone: '09171234567' },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.registrationStatus).toBe('pending');
    expect(res.body.court._id).toBe(String(court._id));
    expect(res.body.court.rejectionReason).toBe('');

    const updated = await Court.findById(court._id).lean();
    expect(updated).toMatchObject({
      name: 'Updated Court',
      slug: 'updated-court',
      registrationStatus: 'pending',
      rejectionReason: '',
      courtCount: 8,
    });
    expect(updated.contactPerson.name).toBe('Juan Dela Cruz');
    expect(updated.subscription.status).toBe('pending');
    expect(updated.subscription.trialEnds).toBeNull();
    expect(await Court.countDocuments({ adminEmail: 'rejected@court.com' })).toBe(1);
  });

  test('PATCH /api/court/me/registration rejects non-rejected registrations and duplicate slugs', async () => {
    const pending = await Court.create({
      name: 'Pending Court', slug: 'pending-court', adminEmail: 'pending@court.com',
      registrationStatus: 'pending', subscription: { status: 'pending' },
    });
    const rejected = await Court.create({
      name: 'Rejected Court', slug: 'rejected-court', adminEmail: 'rejected@court.com',
      registrationStatus: 'rejected', subscription: { status: 'pending' },
    });
    await Court.create({
      name: 'Existing Slug Court', slug: 'taken-slug', adminEmail: 'other@court.com',
      subscription: { status: 'active' },
    });
    const payload = {
      name: 'Resubmitted Court', slug: 'taken-slug',
      location: { city: 'Manila', lat: 14.6, lng: 120.98 },
      contactPerson: { name: 'Contact', phone: '09170000000' },
    };

    const pendingRes = await request(app)
      .patch('/api/court/me/registration')
      .set('x-court-id', String(pending._id))
      .set('x-user-role', 'admin')
      .send(payload);
    const nonAdminRes = await request(app)
      .patch('/api/court/me/registration')
      .set('x-court-id', String(rejected._id))
      .set('x-user-role', 'user')
      .send(payload);
    const slugRes = await request(app)
      .patch('/api/court/me/registration')
      .set('x-court-id', String(rejected._id))
      .set('x-user-role', 'admin')
      .send(payload);

    expect(pendingRes.status).toBe(403);
    expect(nonAdminRes.status).toBe(403);
    expect(slugRes.status).toBe(409);
    expect(slugRes.body.error).toMatch(/slug is already taken/i);
  });

  test('subscription upgrade and downgrade require court admin', async () => {
    const court = await Court.create({
      name: 'Subscription Role Court',
      slug: 'subscription-role-court',
      adminEmail: 'subscription-role@example.com',
      registrationStatus: 'approved',
      subscription: { status: 'active', tier: 'premium', nextBilling: new Date('2030-01-01T00:00:00.000Z') },
    });

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

  test('subscription upgrade and downgrade reject extra, protected, and operator fields', async () => {
    const court = await Court.create({
      name: 'Subscription Body Court',
      slug: 'subscription-body-court',
      adminEmail: 'subscription-body@example.com',
      registrationStatus: 'approved',
      subscription: { status: 'active', tier: 'premium', amount: 5000 },
    });
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

  test('admin can schedule a downgrade without mutating current tier or amount', async () => {
    const nextBilling = new Date('2030-01-01T00:00:00.000Z');
    const court = await Court.create({
      name: 'Subscription Downgrade Court',
      slug: 'subscription-downgrade-court',
      adminEmail: 'subscription-downgrade@example.com',
      registrationStatus: 'approved',
      subscription: { status: 'active', tier: 'premium', amount: 5000, nextBilling },
    });

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
        registrationStatus: 'approved',
        subscription: { status: 'trial', tier: 'basic' },
      });
      const subscriptionBefore = (await Court.findById(court._id).lean()).subscription;
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
      const updatedCourt = await Court.findById(court._id).lean();
      expect(updatedCourt.subscription.status).toBe(subscriptionBefore.status);
      expect(updatedCourt.subscription.tier).toBe(subscriptionBefore.tier);
      expect(updatedCourt.subscription.amount).toBe(subscriptionBefore.amount);
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
