import request from 'supertest';
import app from '../../src/app.js';
import Court from '../../src/models/Court.js';
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
});
