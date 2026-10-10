import crypto from 'node:crypto';
import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../../src/app.js';
import Court from '../../src/models/Court.js';
import Reservation from '../../src/models/Reservation.js';
import ScheduleRule from '../../src/models/ScheduleRule.js';
import User from '../../src/models/User.js';

function signedInAs(email) {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ email, iat: now, exp: now + 300 })).toString('base64url');
  const secret = 'registration-test-secret';
  process.env.KOURTLY_INTERNAL_AUTH_SECRET = secret;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

async function withXenditSettings(routingEnabled, callback) {
  const previous = {
    PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER,
    XENDIT_SECRET_KEY: process.env.XENDIT_SECRET_KEY,
    XENDIT_XENPLATFORM_ENABLED: process.env.XENDIT_XENPLATFORM_ENABLED,
  };
  process.env.PAYMENT_PROVIDER = 'xendit';
  process.env.XENDIT_SECRET_KEY = 'xnd_development_test';
  process.env.XENDIT_XENPLATFORM_ENABLED = String(routingEnabled);
  try {
    return await callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function makePublicBookingCourt(slug, xendit = {}) {
  const court = await Court.create({
    name: `Court ${slug}`,
    slug,
    adminEmail: `${slug}@court.com`,
    courtCount: 4,
    isActive: true,
    subscription: { status: 'active', tier: 'basic' },
    xendit,
  });
  await ScheduleRule.create({
    courtId: court._id,
    dayOfWeek: 2,
    isClosed: false,
    openTime: '09:00',
    closeTime: '23:00',
  });
  return court;
}

function validPublicBooking(slots = {}) {
  return {
    courtNum: 1,
    date: '2026-04-14',
    timeSlot: '13:00-14:00',
    duration: 1,
    name: 'New Guest',
    phone: '09179999999',
    ...slots,
  };
}

describe('public routes', () => {
  test('GET /api/public/courts returns only active trial/active courts', async () => {
    await Court.create([
      { name: 'A', slug: 'a', adminEmail: 'a@court.com', isActive: true, subscription: { status: 'active' } },
      { name: 'B', slug: 'b', adminEmail: 'b@court.com', isActive: true, subscription: { status: 'trial' } },
      { name: 'C', slug: 'c', adminEmail: 'c@court.com', isActive: true, subscription: { status: 'expired' } },
      { name: 'D', slug: 'd', adminEmail: 'd@court.com', isActive: false, subscription: { status: 'active' } },
    ]);

    const res = await request(app).get('/api/public/courts');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((c) => c.slug).sort()).toEqual(['a', 'b']);
  });

  test('POST /api/register-court requires a signed-in user', async () => {
    const res = await request(app).post('/api/register-court').send({ name: 'Court X' });
    expect(res.status).toBe(401);
  });

  test('POST /api/register-court validates required fields', async () => {
    await User.create({ email: 'registration@court.com' });
    const res = await request(app)
      .post('/api/register-court')
      .set('x-kourtly-auth', signedInAs('registration@court.com'))
      .send({ name: 'Court X' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  test('POST /api/register-court creates a pending court and links the signed-in admin', async () => {
    await User.create({ email: 'admin@prime.com' });
    const payload = {
      name: 'Prime Court',
      slug: 'prime-court',
      adminEmail: 'attacker@invalid.com',
      courtCount: 4,
      location: { city: 'Manila', lat: 14.5995, lng: 120.9842 },
      contactPerson: { name: 'Prime Contact', phone: '09170000000' },
    };

    const res = await request(app)
      .post('/api/register-court')
      .set('x-kourtly-auth', signedInAs('admin@prime.com'))
      .send(payload);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.slug).toBe('prime-court');

    const createdCourt = await Court.findOne({ slug: 'prime-court' }).lean();
    const adminUser = await User.findOne({ email: 'admin@prime.com' }).lean();
    const attackerUser = await User.findOne({ email: 'attacker@invalid.com' }).lean();
    expect(createdCourt).toBeTruthy();
    expect(createdCourt.registrationStatus).toBe('pending');
    expect(createdCourt.registeredBy.toString()).toBe(adminUser._id.toString());
    expect(createdCourt.subscription.status).toBe('pending');
    expect(createdCourt.subscription.trialEnds).toBeNull();
    expect(createdCourt.location.lat).toBe(14.5995);
    expect(createdCourt.location.lng).toBe(120.9842);
    expect(createdCourt.contactPerson.name).toBe('Prime Contact');
    expect(adminUser).toBeTruthy();
    expect(adminUser.role).toBe('admin');
    expect(attackerUser).toBeNull();
  });

  test('POST /api/public/courts/:slug/reserve prevents overlaps', async () => {
    const court = await Court.create({
      name: 'Overlap Court',
      slug: 'overlap-court',
      adminEmail: 'owner@overlap.com',
      courtCount: 4,
      isActive: true,
      subscription: { status: 'active' },
    });

    await ScheduleRule.create({
      courtId: court._id,
      dayOfWeek: 2,
      isClosed: false,
      openTime: '09:00',
      closeTime: '23:00',
    });

    await Reservation.create({
      courtId: court._id,
      court: 1,
      date: '2026-04-14',
      timeSlot: '13:00-14:00',
      duration: 1,
      name: 'Existing',
      phone: '09170000000',
      status: 'confirmed',
    });

    const res = await request(app).post('/api/public/courts/overlap-court/reserve').send({
      courtNum: 1,
      date: '2026-04-14',
      timeSlot: '13:00-14:00',
      duration: 1,
      name: 'New User',
      phone: '09179999999',
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already booked/i);
  });

  test('POST /api/public/courts/:slug/reserve rejects a duration that exceeds closing time', async () => {
    const court = await Court.create({
      name: 'Hours Court',
      slug: 'hours-court',
      adminEmail: 'owner@hours.com',
      courtCount: 1,
      isActive: true,
      subscription: { status: 'active' },
    });
    await ScheduleRule.create({ courtId: court._id, dayOfWeek: 2, isClosed: false, openTime: '09:00', closeTime: '16:00' });

    const res = await request(app).post('/api/public/courts/hours-court/reserve').send({
      courtNum: 1, date: '2026-04-14', timeSlot: '15:00-16:00', duration: 4,
      name: 'New User', phone: '09179999999',
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/outside open hours|blocked/i);
  });

  test('POST /api/public/courts/:slug/reserve treats pending reservations as conflicts', async () => {
    const court = await Court.create({
      name: 'Pending Court', slug: 'pending-court', adminEmail: 'owner@pending.com', courtCount: 1,
      isActive: true, subscription: { status: 'active' },
    });
    await ScheduleRule.create({ courtId: court._id, dayOfWeek: 2, isClosed: false, openTime: '09:00', closeTime: '23:00' });
    await Reservation.create({ courtId: court._id, court: 1, date: '2026-04-14', timeSlot: '13:00-14:00', duration: 1, name: 'Pending', phone: '09170000000', status: 'pending_admin' });

    const res = await request(app).post('/api/public/courts/pending-court/reserve').send({
      courtNum: 1, date: '2026-04-14', timeSlot: '13:00-14:00', duration: 1,
      name: 'New User', phone: '09179999999',
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already booked/i);
  });

  test('public booking fails clearly when Xendit sub-account readiness is missing', async () => {
    const previous = {
      PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER,
      XENDIT_SECRET_KEY: process.env.XENDIT_SECRET_KEY,
      XENDIT_XENPLATFORM_ENABLED: process.env.XENDIT_XENPLATFORM_ENABLED,
    };
    process.env.PAYMENT_PROVIDER = 'xendit';
    process.env.XENDIT_SECRET_KEY = 'xnd_development_test';
    process.env.XENDIT_XENPLATFORM_ENABLED = 'true';
    try {
      await Court.create({
        name: 'Not Ready Court',
        slug: 'not-ready-court',
        adminEmail: 'not-ready@example.com',
        isActive: true,
        subscription: { status: 'active', tier: 'basic' },
      });
      await ScheduleRule.create({
        courtId: await Court.findOne({ slug: 'not-ready-court' }).then(court => court._id),
        dayOfWeek: 2,
        isClosed: false,
        openTime: '09:00',
        closeTime: '23:00',
      });

      const response = await request(app).post('/api/public/courts/not-ready-court/reserve').send({
        courtNum: 1,
        date: '2026-04-14',
        timeSlot: '13:00-14:00',
        name: 'Guest',
        phone: '09170000000',
      });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('online booking is not available for this venue yet');
      expect(await Reservation.countDocuments({})).toBe(0);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  test('rollout off creates a master-account invoice for a court without a sub-account', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'master-invoice', invoice_url: 'https://checkout.example/invoice' }),
    });
    try {
      await withXenditSettings(false, async () => {
        await makePublicBookingCourt('master-invoice-court');
        const response = await request(app)
          .post('/api/public/courts/master-invoice-court/reserve')
          .send(validPublicBooking());

        expect(response.status).toBe(201);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy.mock.calls[0][1].headers).not.toHaveProperty('for-user-id');
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test('rollout on rejects an unready court only after a valid conflict-free booking request', async () => {
    await withXenditSettings(true, async () => {
      await makePublicBookingCourt('not-ready-after-checks');
      const response = await request(app)
        .post('/api/public/courts/not-ready-after-checks/reserve')
        .send(validPublicBooking());

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('online booking is not available for this venue yet');
      expect(await Reservation.countDocuments({})).toBe(0);
    });
  });

  test('rollout on routes a ready court invoice with its sub-account ID', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'sub-account-invoice', invoice_url: 'https://checkout.example/invoice' }),
    });
    try {
      await withXenditSettings(true, async () => {
        await makePublicBookingCourt('sub-account-invoice-court', {
          subAccountId: 'court-xendit-id',
          status: 'REGISTERED',
          webhookConfigured: true,
        });
        const response = await request(app)
          .post('/api/public/courts/sub-account-invoice-court/reserve')
          .send(validPublicBooking());

        expect(response.status).toBe(201);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy.mock.calls[0][1].headers['for-user-id']).toBe('court-xendit-id');
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test('invalid booking returns 400 and overlapping booking returns already booked with rollout on', async () => {
    await withXenditSettings(true, async () => {
      await makePublicBookingCourt('not-ready-invalid-conflict');

      const invalid = await request(app)
        .post('/api/public/courts/not-ready-invalid-conflict/reserve')
        .send({ name: 'Missing details' });
      expect(invalid.status).toBe(400);
      expect(invalid.body.error).toMatch(/courtNum, date, timeSlot, name, and phone are required/i);

      await Reservation.create({
        courtId: await Court.findOne({ slug: 'not-ready-invalid-conflict' }).then(court => court._id),
        court: 1,
        date: '2026-04-14',
        timeSlot: '13:00-14:00',
        duration: 1,
        name: 'Existing Guest',
        phone: '09170000000',
        status: 'pending_admin',
      });
      const conflict = await request(app)
        .post('/api/public/courts/not-ready-invalid-conflict/reserve')
        .send(validPublicBooking());
      expect(conflict.status).toBe(409);
      expect(conflict.body.error).toBe('This slot is already booked.');
    });
  });
});
