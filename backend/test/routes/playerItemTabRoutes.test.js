import request from 'supertest';
import app from '../../src/app.js';
import Court from '../../src/models/Court.js';
import Player from '../../src/models/Player.js';
import Item from '../../src/models/Item.js';
import Tab from '../../src/models/Tab.js';

async function makeCourt() {
  return Court.create({
    name: 'Ops Court',
    slug: `ops-court-${Date.now()}`,
    adminEmail: 'ops@court.com',
    isActive: true,
    subscription: { status: 'active', tier: 'premium' },
    courtCount: 4,
  });
}

describe('player, item, and tab routes', () => {
  test('player create + list works under tenant context', async () => {
    const court = await makeCourt();
    const createRes = await request(app)
      .post('/api/players')
      .set('x-court-id', String(court._id))
      .send({ name: 'Ace', level: 'B', gender: 'Male', age: 25 });

    expect(createRes.status).toBe(201);

    const listRes = await request(app)
      .get('/api/players')
      .set('x-court-id', String(court._id));
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
  });

  test('item create + splittable list returns only active splittable items', async () => {
    const court = await makeCourt();
    await Item.create([
      { courtId: court._id, name: 'Shuttle', price: 120, isSplittable: true, isActive: true },
      { courtId: court._id, name: 'Water', price: 30, isSplittable: false, isActive: true },
      { courtId: court._id, name: 'Old Shuttle', price: 100, isSplittable: true, isActive: false },
    ]);

    const list = await request(app)
      .get('/api/items/splittable')
      .set('x-court-id', String(court._id));

    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].name).toBe('Shuttle');
  });

  test('tab open rejects duplicate open tab for same player', async () => {
    const court = await makeCourt();
    const player = await Player.create({
      courtId: court._id,
      name: 'Tab Player',
      level: 'C',
      gender: 'Female',
      age: 22,
    });
    await Tab.create({ courtId: court._id, player: player._id, items: [], total: 0, status: 'open' });

    const res = await request(app)
      .post('/api/tabs')
      .set('x-court-id', String(court._id))
      .send({ player: String(player._id) });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already has an open tab/i);
  });

  test('tab add item increments total', async () => {
    const court = await makeCourt();
    const player = await Player.create({
      courtId: court._id,
      name: 'Item Player',
      level: 'A',
      gender: 'Male',
      age: 28,
    });
    const tab = await Tab.create({ courtId: court._id, player: player._id, items: [], total: 0, status: 'open' });

    const res = await request(app)
      .post(`/api/tabs/${tab._id}/items`)
      .set('x-court-id', String(court._id))
      .send({ name: 'Drink', price: 50, quantity: 2 });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(100);
    expect(res.body.items).toHaveLength(1);
  });
});
