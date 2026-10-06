import request from 'supertest';
import app from '../../src/app.js';
import Court from '../../src/models/Court.js';
import Reservation from '../../src/models/Reservation.js';
import ScheduleRule from '../../src/models/ScheduleRule.js';

const previousTestAuthBypass = process.env.ALLOW_TEST_AUTH_BYPASS;

beforeAll(() => {
  process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
});

afterAll(() => {
  if (previousTestAuthBypass === undefined) delete process.env.ALLOW_TEST_AUTH_BYPASS;
  else process.env.ALLOW_TEST_AUTH_BYPASS = previousTestAuthBypass;
});

describe('reservation routes with tenant middleware', () => {
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
      subscription: { status: 'active' },
      courtCount: 4,
    });
    const requestingCourt = await Court.create({
      name: 'Requesting Court',
      slug: 'requesting-court',
      adminEmail: 'requesting@court.com',
      isActive: true,
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
});
