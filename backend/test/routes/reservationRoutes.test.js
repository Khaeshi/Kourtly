import request from 'supertest';
import app from '../../src/app.js';
import Court from '../../src/models/Court.js';
import ScheduleRule from '../../src/models/ScheduleRule.js';

describe('reservation routes with tenant middleware', () => {
  test('GET /api/reservations rejects missing x-court-id', async () => {
    const res = await request(app).get('/api/reservations');
    expect(res.status).toBe(401);
  });

  test('GET /api/reservations rejects invalid court id', async () => {
    const res = await request(app).get('/api/reservations').set('x-court-id', 'bad-id');
    expect(res.status).toBe(400);
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
