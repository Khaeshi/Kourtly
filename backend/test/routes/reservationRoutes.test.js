import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import Court from '../../src/models/Court.js';
import Reservation from '../../src/models/Reservation.js';
import ScheduleRule from '../../src/models/ScheduleRule.js';
import ScheduleBlock from '../../src/models/ScheduleBlock.js';
import { getCourtDayRange } from '../../src/services/itemStock.js';
import { getDayOfWeek } from '../../src/utils/scheduleUtils.js';

const previousTestAuthBypass = process.env.ALLOW_TEST_AUTH_BYPASS;

beforeAll(() => {
  process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
});

afterAll(() => {
  if (previousTestAuthBypass === undefined) delete process.env.ALLOW_TEST_AUTH_BYPASS;
  else process.env.ALLOW_TEST_AUTH_BYPASS = previousTestAuthBypass;
});

async function withXenditSettings(_routingEnabled, callback) {
  const previous = {
    PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER,
    XENDIT_SECRET_KEY: process.env.XENDIT_SECRET_KEY,
  };
  process.env.PAYMENT_PROVIDER = 'xendit';
  process.env.XENDIT_SECRET_KEY = 'xnd_development_test';
  try {
    return await callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function dateOffset(days) {
  const { date } = getCourtDayRange(new Date(), 'Asia/Manila');
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

async function makeGridCourt({ courtCount = 8, date = dateOffset(2) } = {}) {
  const court = await Court.create({
    name: 'Walk-in Grid Court',
    slug: `walk-in-grid-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    adminEmail: 'walk-in-grid@court.com',
    isActive: true,
    registrationStatus: 'approved',
    subscription: { status: 'active', tier: 'premium' },
    courtCount,
    settings: { timezone: 'Asia/Manila', hourlyRate: 210, reservationFee: 210 },
  });
  await ScheduleRule.create({
    courtId: court._id,
    dayOfWeek: getDayOfWeek(date),
    isClosed: false,
    openTime: '09:00',
    closeTime: '23:00',
  });
  return { court, date };
}

async function postWalkIn(court, date, body = {}) {
  return request(app)
    .post('/api/reservations/walk-in')
    .set('x-court-id', String(court._id))
    .send({
      name: 'Walk-in Guest',
      phone: '09171234567',
      court: 8,
      date,
      startTime: '10:00',
      duration: 1,
      playerCount: 4,
      paymentMode: 'counter',
      ...body,
    });
}

describe('reservation routes with tenant middleware', () => {
  test('GET /api/reservations/grid returns resolved schedule and reservations for every physical court', async () => {
    const { court, date } = await makeGridCourt();
    await ScheduleBlock.create({
      courtId: court._id,
      date,
      courts: [2],
      blockType: 'range',
      startTime: '10:00',
      endTime: '12:00',
      reason: 'Maintenance',
    });
    await Reservation.create({
      courtId: court._id,
      name: 'Court Eight Guest',
      phone: '09170000000',
      court: 8,
      date,
      timeSlot: '10:00-11:00',
      duration: 1,
      status: 'confirmed',
      paymentStatus: 'paid',
    });

    const response = await request(app)
      .get(`/api/reservations/grid?date=${date}`)
      .set('x-court-id', String(court._id));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      date,
      courtCount: 8,
      timezone: 'Asia/Manila',
      isFullyClosed: false,
    });
    expect(response.body.courts).toHaveLength(8);
    expect(response.body.courts[1].openSlots).not.toContain('10:00-11:00');
    expect(response.body.courts[7].reservations).toHaveLength(1);
    expect(response.body.courts[7].reservations[0].status).toBe('confirmed');
  });

  test('POST /api/reservations/walk-in creates a confirmed counter-paid booking without online fees', async () => {
    const { court, date } = await makeGridCourt();
    const response = await postWalkIn(court, date);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      paymentUrl: null,
      paymentExpiresAt: null,
      amountDue: 210,
      reservation: {
        court: 8,
        date,
        timeSlot: '10:00-11:00',
        duration: 1,
        playerCount: 4,
        status: 'confirmed',
        paymentStatus: 'paid',
        paymentMethod: 'counter',
        paymentChannel: 'counter',
        paymentOption: 'full',
        reservationFeeAmount: 210,
        maintenanceFeeAmount: 0,
        amountPaidOnline: 0,
        remainingBalanceAmount: 0,
      },
    });
    expect(response.body.reservation.bookingSlots).toEqual(['0600']);
  });

  test('POST /api/reservations/walk-in creates a downpayment link with the existing online fee and expiry', async () => {
    const previousProvider = process.env.PAYMENT_PROVIDER;
    const previousAppBaseUrl = process.env.APP_BASE_URL;
    process.env.PAYMENT_PROVIDER = 'mock';
    process.env.APP_BASE_URL = 'https://kourtly.example';
    try {
      const { court, date } = await makeGridCourt();
      const response = await postWalkIn(court, date, { paymentMode: 'payment_link', paymentOption: 'downpayment' });

      expect(response.status).toBe(201);
      expect(response.body.amountDue).toBe(107.1);
      expect(response.body.paymentUrl).toContain('mockPayment=1');
      expect(response.body.paymentExpiresAt).toBeTruthy();
      expect(response.body.reservation).toMatchObject({
        status: 'approved_waiting_payment',
        paymentStatus: 'awaiting_payment',
        paymentOption: 'downpayment',
        reservationFeeAmount: 210,
        downpaymentAmount: 105,
        maintenanceFeeAmount: 2.1,
        paymentExpectedAmount: 107.1,
      });
      expect(response.body.reservation.paymentUrl).toBe(response.body.paymentUrl);
    } finally {
      if (previousProvider === undefined) delete process.env.PAYMENT_PROVIDER;
      else process.env.PAYMENT_PROVIDER = previousProvider;
      if (previousAppBaseUrl === undefined) delete process.env.APP_BASE_URL;
      else process.env.APP_BASE_URL = previousAppBaseUrl;
    }
  });

  test('POST /api/reservations/walk-in rejects conflicts, blocks, and courts outside the dynamic court count', async () => {
    const { court, date } = await makeGridCourt();
    await Reservation.create({
      courtId: court._id, name: 'Existing', phone: '09170000000',
      court: 8, date, timeSlot: '10:00-11:00', duration: 1,
      status: 'confirmed', bookingSlots: ['0600'],
    });

    const conflict = await postWalkIn(court, date);
    expect(conflict.status).toBe(409);

    const blockedDate = dateOffset(3);
    await ScheduleRule.create({
      courtId: court._id, dayOfWeek: getDayOfWeek(blockedDate),
      isClosed: false, openTime: '09:00', closeTime: '23:00',
    });
    await ScheduleBlock.create({
      courtId: court._id, date: blockedDate, courts: [8],
      blockType: 'range', startTime: '10:00', endTime: '11:00',
    });
    const blocked = await postWalkIn(court, blockedDate);
    expect(blocked.status).toBe(403);

    const outsideCourtCount = await postWalkIn(court, blockedDate, {
      court: 9, startTime: '12:00',
    });
    expect(outsideCourtCount.status).toBe(400);
  });

  test('walk-in requires a phone and enforces the player limit', async () => {
    const { court, date } = await makeGridCourt();
    const missingPhone = await postWalkIn(court, date, { phone: '' });
    expect(missingPhone.status).toBe(400);
    const tooManyPlayers = await postWalkIn(court, date, { playerCount: 11 });
    expect(tooManyPlayers.status).toBe(400);
  });

  test('concurrent walk-ins cannot claim the same court slot', async () => {
    const { court, date } = await makeGridCourt();
    const [first, second] = await Promise.all([
      postWalkIn(court, date),
      postWalkIn(court, date),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 409]);
    expect(await Reservation.countDocuments({ courtId: court._id, court: 8, date })).toBe(1);
  });

  test('GET /api/reservations rejects missing x-court-id', async () => {
    const res = await request(app).get('/api/reservations');
    expect(res.status).toBe(401);
  });

  test('GET /api/reservations rejects invalid court id', async () => {
    const res = await request(app).get('/api/reservations').set('x-court-id', 'bad-id');
    expect(res.status).toBe(400);
  });

  test('GET /api/reservations validates and caps inclusive date ranges', async () => {
    const court = await Court.create({
      name: 'Bounded Range Court',
      slug: 'bounded-range-court',
      adminEmail: 'bounded-range@court.com',
      isActive: true,
      registrationStatus: 'approved',
      subscription: { status: 'active' },
      courtCount: 4,
    });
    const start = new Date('2026-04-01T00:00:00.000Z');
    const rangeRows = Array.from({ length: 1001 }, (_, index) => {
      const date = new Date(start.getTime() + (index % 62) * 86_400_000)
        .toISOString()
        .slice(0, 10);
      return {
        courtId: court._id,
        name: `Guest ${index}`,
        phone: `0917${String(index).padStart(7, '0')}`,
        court: 1,
        date,
        timeSlot: `${String(Math.floor(index / 62) % 14 + 8).padStart(2, '0')}:00-09:00`,
        bookingSlots: [`range-${index}`],
      };
    });
    await Reservation.insertMany(rangeRows);

    const baseUrl = '/api/reservations?dateFrom=2026-04-01&dateTo=2026-06-01';
    const accepted = await request(app).get(baseUrl).set('x-court-id', String(court._id));
    expect(accepted.status).toBe(200);
    expect(accepted.body).toHaveLength(1001);
    expect(accepted.body[0].date).toBe('2026-04-01');
    expect(accepted.body[accepted.body.length - 1].date).toBe('2026-06-01');

    const overlong = await request(app)
      .get('/api/reservations?dateFrom=2026-04-01&dateTo=2026-06-02')
      .set('x-court-id', String(court._id));
    expect(overlong.status).toBe(400);

    const reversed = await request(app)
      .get('/api/reservations?dateFrom=2026-04-02&dateTo=2026-04-01')
      .set('x-court-id', String(court._id));
    expect(reversed.status).toBe(400);

    const invalid = await request(app)
      .get('/api/reservations?dateFrom=2026-02-30&dateTo=2026-03-01')
      .set('x-court-id', String(court._id));
    expect(invalid.status).toBe(400);
  });

  test('GET /api/reservations rejects ranges containing more than 2000 rows', async () => {
    const court = await Court.create({
      name: 'Large Range Court',
      slug: 'large-range-court',
      adminEmail: 'large-range@court.com',
      isActive: true,
      registrationStatus: 'approved',
      subscription: { status: 'active' },
      courtCount: 4,
    });
    await Reservation.insertMany(Array.from({ length: 2001 }, (_, index) => ({
      courtId: court._id,
      name: `Guest ${index}`,
      phone: `0917${String(index).padStart(7, '0')}`,
      court: 1,
      date: '2026-04-01',
      timeSlot: `${String(index % 14 + 8).padStart(2, '0')}:00-09:00`,
      bookingSlots: [`large-range-${index}`],
    })));

    const res = await request(app)
      .get('/api/reservations?dateFrom=2026-04-01&dateTo=2026-04-01')
      .set('x-court-id', String(court._id));

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: 'Too many reservations in this range. Narrow the range.',
    });
  });

  test('DELETE /api/reservations/:id cannot delete another court reservation', async () => {
    const ownerCourt = await Court.create({
      name: 'Reservation Owner Court',
      slug: 'reservation-owner-court',
      adminEmail: 'owner@court.com',
      isActive: true,
      registrationStatus: 'approved',
      subscription: { status: 'active' },
      courtCount: 4,
    });
    const requestingCourt = await Court.create({
      name: 'Requesting Court',
      slug: 'requesting-court',
      adminEmail: 'requesting@court.com',
      isActive: true,
      registrationStatus: 'approved',
      subscription: { status: 'active' },
      courtCount: 4,
    });
    const reservation = await Reservation.create({
      courtId: ownerCourt._id,
      name: 'Other Tenant Guest',
      phone: '09171234567',
      court: 1,
      date: '2026-04-01',
      timeSlot: '10:00-11:00',
      bookingSlots: ['cross-court-delete'],
    });

    const res = await request(app)
      .delete(`/api/reservations/${reservation._id}`)
      .set('x-court-id', String(requestingCourt._id));

    expect(res.status).toBe(404);
    await expect(Reservation.findById(reservation._id)).resolves.not.toBeNull();
  });

  test('POST /api/reservations creates reservation with valid tenant headers', async () => {
    const court = await Court.create({
      name: 'Tenant Court',
      slug: 'tenant-court',
      adminEmail: 'tenant@court.com',
      isActive: true,
      registrationStatus: 'approved',
      subscription: { status: 'active' },
      courtCount: 4,
    });

    await ScheduleRule.create({
      courtId: court._id,
      dayOfWeek: 2,
      isClosed: false,
      openTime: '09:00',
      closeTime: '23:00',
    });

    const res = await request(app)
      .post('/api/reservations')
      .set('x-court-id', String(court._id))
      .send({
        courtId: court._id,
        court: 1,
        date: '2026-04-14',
        timeSlot: '10:00-11:00',
        duration: 1,
        name: 'Walk-in',
        phone: '09171234567',
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Walk-in');
    expect(res.body.timeSlot).toBe('10:00-11:00');
  });

  test('admin cannot create a reservation invoice before the court sub-account is ready', async () => {
    const previous = {
      PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER,
      XENDIT_SECRET_KEY: process.env.XENDIT_SECRET_KEY,
    };
    process.env.PAYMENT_PROVIDER = 'xendit';
    process.env.XENDIT_SECRET_KEY = 'xnd_development_test';
    try {
      const court = await Court.create({
        name: 'Admin Not Ready Court',
        slug: 'admin-not-ready',
        adminEmail: 'admin-not-ready@example.com',
        isActive: true,
        registrationStatus: 'approved',
        subscription: { status: 'active' },
      });
      const reservation = await Reservation.create({
        courtId: court._id,
        name: 'Guest',
        phone: '09170000000',
        court: 1,
        date: '2026-04-14',
        timeSlot: '13:00-14:00',
        duration: 1,
        status: 'pending_admin',
      });

      const response = await request(app)
        .post(`/api/reservations/${reservation._id}/approve-payment`)
        .set('x-court-id', String(court._id))
        .set('x-user-role', 'admin');

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Online payment is not available for this venue yet.');
      expect(await Reservation.findById(reservation._id).select('paymentStatus').lean())
        .toMatchObject({ paymentStatus: 'none' });
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  test('admin payment routes the invoice with the court sub-account ID', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'admin-sub-account-invoice', invoice_url: 'https://checkout.example/invoice' }),
    });
    try {
      await withXenditSettings(true, async () => {
        const court = await Court.create({
          name: 'Admin Sub-account Invoice Court',
          slug: 'admin-sub-account-invoice',
          adminEmail: 'admin-sub-account-invoice@example.com',
          isActive: true,
          registrationStatus: 'approved',
          subscription: { status: 'active' },
          xendit: {
            subAccountId: 'admin-court-xendit-id',
            status: 'REGISTERED',
            webhookConfigured: true,
          },
        });
        const reservation = await Reservation.create({
          courtId: court._id,
          name: 'Guest',
          phone: '09170000000',
          court: 1,
          date: '2026-10-12',
          timeSlot: '13:00-14:00',
          duration: 1,
          status: 'pending_admin',
        });

        const response = await request(app)
          .post(`/api/reservations/${reservation._id}/approve-payment`)
          .set('x-court-id', String(court._id))
          .send({});

        expect(response.status).toBe(200);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy.mock.calls[0][1].headers['for-user-id']).toBe('admin-court-xendit-id');
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
