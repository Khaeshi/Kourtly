import request from 'supertest';
import app from '../../src/app.js';
import Court from '../../src/models/Court.js';
import Reservation from '../../src/models/Reservation.js';
import ScheduleRule from '../../src/models/ScheduleRule.js';
import User from '../../src/models/User.js';

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

  test('POST /api/public/register-court validates required fields', async () => {
    const res = await request(app).post('/api/public/register-court').send({ name: 'Court X' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  test('POST /api/public/register-court creates court and admin link', async () => {
    const payload = {
      name: 'Prime Court',
      slug: 'prime-court',
      adminEmail: 'admin@prime.com',
      courtCount: 4,
    };

    const res = await request(app).post('/api/public/register-court').send(payload);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.slug).toBe('prime-court');

    const createdCourt = await Court.findOne({ slug: 'prime-court' }).lean();
    const adminUser = await User.findOne({ email: 'admin@prime.com' }).lean();
    expect(createdCourt).toBeTruthy();
    expect(adminUser).toBeTruthy();
    expect(adminUser.role).toBe('admin');
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
});
