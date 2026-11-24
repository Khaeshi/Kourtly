import request from 'supertest';
import app from '../../src/app.js';
import Court from '../../src/models/Court.js';
import Player from '../../src/models/Player.js';
import Item from '../../src/models/Item.js';
import Tab from '../../src/models/Tab.js';

async function makeCourt() {
  return Court.create({
    name: 'Ops Court',
    slug: `ops-court-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    adminEmail: 'ops@court.com',
    isActive: true,
    registrationStatus: 'approved',
    subscription: { status: 'active', tier: 'premium' },
    courtCount: 4,
  });
}

describe('player, item, and tab routes', () => {
  test('player create + list works under tenant context', async () => {
    const court = await makeCourt();
    const otherCourt = await makeCourt();
    const createRes = await request(app)
      .post('/api/players')
      .set('x-court-id', String(court._id))
      .send({
        courtId: String(otherCourt._id),
        name: 'Ace',
        level: 'B',
        gender: 'Male',
        age: 25,
        matchCount: 99,
        isActive: false,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.courtId).toBe(String(court._id));
    expect(createRes.body.matchCount).toBe(0);
    expect(createRes.body.isActive).toBe(true);

    const listRes = await request(app)
      .get('/api/players')
      .set('x-court-id', String(court._id));
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
  });

  test('player updates ignore tenant and server-managed fields and validate editable fields', async () => {
    const court = await makeCourt();
    const otherCourt = await makeCourt();
    const player = await Player.create({
      courtId: court._id,
      name: 'Original',
      level: 'B',
      gender: 'Male',
      age: 25,
    });

    const response = await request(app)
      .patch(`/api/players/${player._id}`)
      .set('x-court-id', String(court._id))
      .send({
        courtId: String(otherCourt._id),
        name: 'Updated',
        matchCount: 99,
        isActive: false,
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      courtId: String(court._id),
      name: 'Updated',
      matchCount: 0,
      isActive: true,
    });
  });

  test.each([
    [{ $set: { name: 'Injected' } }],
    [{ 'name.display': 'Injected' }],
    [{ name: { value: 'Injected' } }],
    [{ age: ['25'] }],
  ])('player update rejects unsafe keys and invalid field types: %o', async body => {
    const court = await makeCourt();
    const player = await Player.create({
      courtId: court._id,
      name: 'Original',
      level: 'B',
      gender: 'Male',
      age: 25,
    });

    const response = await request(app)
      .patch(`/api/players/${player._id}`)
      .set('x-court-id', String(court._id))
      .send(body);

    expect(response.status).toBe(400);
    await expect(Player.findById(player._id).lean()).resolves.toMatchObject({ name: 'Original' });
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

  test('item create and update validate prices and reject unsafe request fields', async () => {
    const court = await makeCourt();
    const valid = await request(app)
      .post('/api/items')
      .set('x-court-id', String(court._id))
      .send({ name: 'Valid item', price: 0, category: 'general', isActive: true });
    expect(valid.status).toBe(201);
    expect(valid.body.price).toBe(0);

    for (const price of [-1, 10001, NaN, Infinity, null, {}, '10']) {
      const response = await request(app)
        .post('/api/items')
        .set('x-court-id', String(court._id))
        .send({ name: 'Invalid item', price });
      expect(response.status).toBe(400);
    }

    const operator = await request(app)
      .put(`/api/items/${valid.body._id}`)
      .set('x-court-id', String(court._id))
      .send({ $set: { price: 1 } });
    expect(operator.status).toBe(400);

    const dotted = await request(app)
      .put(`/api/items/${valid.body._id}`)
      .set('x-court-id', String(court._id))
      .send({ 'price.value': 1 });
    expect(dotted.status).toBe(400);

    const updated = await Item.findById(valid.body._id).lean();
    expect(updated.price).toBe(0);
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

  test('POST /api/tabs rejects a player from another court', async () => {
    const court = await makeCourt();
    const otherCourt = await makeCourt();
    const player = await Player.create({
      courtId: otherCourt._id,
      name: 'Foreign Player',
      level: 'C',
      gender: 'Female',
      age: 22,
    });

    const response = await request(app)
      .post('/api/tabs')
      .set('x-court-id', String(court._id))
      .send({ player: String(player._id) });

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).not.toContain('Foreign Player');
    await expect(Tab.countDocuments({ courtId: court._id })).resolves.toBe(0);
  });

  test('tab reads and item writes do not expose a foreign linked player', async () => {
    const court = await makeCourt();
    const otherCourt = await makeCourt();
    const foreignPlayer = await Player.create({
      courtId: otherCourt._id,
      name: 'Foreign linked player',
      level: 'C',
      gender: 'Female',
      age: 22,
    });
    const [openTab, paidTab] = await Tab.create([
      { courtId: court._id, player: foreignPlayer._id, items: [], total: 0, status: 'open' },
      { courtId: court._id, player: foreignPlayer._id, items: [], total: 0, status: 'paid' },
    ]);

    const open = await request(app)
      .get('/api/tabs/open')
      .set('x-court-id', String(court._id));
    expect(open.status).toBe(200);
    expect(open.body).toEqual([]);

    const history = await request(app)
      .get('/api/tabs/history')
      .set('x-court-id', String(court._id));
    expect(history.status).toBe(200);
    expect(history.body.tabs).toEqual([]);
    expect(JSON.stringify([open.body, history.body])).not.toContain('Foreign linked player');

    const item = await Item.create({ courtId: court._id, name: 'Local Drink', price: 20 });
    const add = await request(app)
      .post(`/api/tabs/${openTab._id}/items`)
      .set('x-court-id', String(court._id))
      .send({ itemId: String(item._id), quantity: 1 });
    expect(add.status).toBe(400);
    await expect(Tab.findById(openTab._id).lean()).resolves.toMatchObject({ total: 0, items: [] });
    expect(String((await Tab.findById(paidTab._id).lean()).player)).toBe(String(foreignPlayer._id));
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
    const item = await Item.create({ courtId: court._id, name: 'Server Drink', price: 50 });
    const tab = await Tab.create({ courtId: court._id, player: player._id, items: [], total: 0, status: 'open' });

    const res = await request(app)
      .post(`/api/tabs/${tab._id}/items`)
      .set('x-court-id', String(court._id))
      .send({
        itemId: String(item._id),
        name: 'Tampered name',
        price: 1,
        quantity: 2,
      });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(100);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      item: String(item._id),
      name: 'Server Drink',
      price: 50,
    });
  });

  test('tab add item replays an idempotency key without duplicating the line', async () => {
    const court = await makeCourt();
    const player = await Player.create({
      courtId: court._id, name: 'Idempotent Player', level: 'A', gender: 'Male', age: 28,
    });
    const item = await Item.create({ courtId: court._id, name: 'Drink', price: 50 });
    const tab = await Tab.create({ courtId: court._id, player: player._id, items: [], total: 0, status: 'open' });
    const body = {
      itemId: String(item._id),
      quantity: 1,
      idempotencyKey: 'tab-charge-once',
    };
    const first = await request(app).post(`/api/tabs/${tab._id}/items`)
      .set('x-court-id', String(court._id)).send(body);
    const replay = await request(app).post(`/api/tabs/${tab._id}/items`)
      .set('x-court-id', String(court._id)).send(body);

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.body.total).toBe(50);
    expect(replay.body.items).toHaveLength(1);
  });

  test('tab item add rejects foreign item and tab IDs without writes', async () => {
    const court = await makeCourt();
    const otherCourt = await makeCourt();
    const player = await Player.create({
      courtId: court._id, name: 'Scoped Player', level: 'A', gender: 'Male', age: 28,
    });
    const otherPlayer = await Player.create({
      courtId: otherCourt._id, name: 'Other Player', level: 'A', gender: 'Male', age: 28,
    });
    const localItem = await Item.create({ courtId: court._id, name: 'Local Drink', price: 50 });
    const foreignItem = await Item.create({ courtId: otherCourt._id, name: 'Foreign Drink', price: 50 });
    const localTab = await Tab.create({ courtId: court._id, player: player._id, items: [], total: 0 });
    const foreignTab = await Tab.create({ courtId: otherCourt._id, player: otherPlayer._id, items: [], total: 0 });

    const itemResponse = await request(app)
      .post(`/api/tabs/${localTab._id}/items`)
      .set('x-court-id', String(court._id))
      .send({ itemId: String(foreignItem._id), quantity: 1 });
    expect(itemResponse.status).toBe(400);
    expect(JSON.stringify(itemResponse.body)).not.toContain('Foreign Drink');

    const tabResponse = await request(app)
      .post(`/api/tabs/${foreignTab._id}/items`)
      .set('x-court-id', String(court._id))
      .send({ itemId: String(localItem._id), quantity: 1 });
    expect(tabResponse.status).toBe(404);
    await expect(Tab.findById(localTab._id).lean()).resolves.toMatchObject({ total: 0, items: [] });
    await expect(Tab.findById(foreignTab._id).lean()).resolves.toMatchObject({ total: 0, items: [] });
  });

  test.each([0, -1, 1.5, 101, null, {}, '2'])(
    'tab item add rejects invalid quantity %o',
    async quantity => {
      const court = await makeCourt();
      const player = await Player.create({
        courtId: court._id, name: 'Quantity Player', level: 'A', gender: 'Male', age: 28,
      });
      const item = await Item.create({ courtId: court._id, name: 'Drink', price: 50 });
      const tab = await Tab.create({ courtId: court._id, player: player._id, items: [], total: 0 });

      const response = await request(app)
        .post(`/api/tabs/${tab._id}/items`)
        .set('x-court-id', String(court._id))
        .send({ itemId: String(item._id), quantity });

      expect(response.status).toBe(400);
      await expect(Tab.findById(tab._id).lean()).resolves.toMatchObject({ total: 0, items: [] });
    }
  );

  test('tab item add enforces total cap and rejects operator keys', async () => {
    const court = await makeCourt();
    const player = await Player.create({
      courtId: court._id, name: 'Limit Player', level: 'A', gender: 'Male', age: 28,
    });
    const item = await Item.create({ courtId: court._id, name: 'Drink', price: 1 });
    const tab = await Tab.create({
      courtId: court._id, player: player._id, items: [], total: 100000,
    });

    const overLimit = await request(app)
      .post(`/api/tabs/${tab._id}/items`)
      .set('x-court-id', String(court._id))
      .send({ itemId: String(item._id), quantity: 1 });
    expect(overLimit.status).toBe(400);

    const injected = await request(app)
      .post(`/api/tabs/${tab._id}/items`)
      .set('x-court-id', String(court._id))
      .send({ itemId: String(item._id), quantity: 1, $set: { total: 0 } });
    expect(injected.status).toBe(400);
    await expect(Tab.findById(tab._id).lean()).resolves.toMatchObject({ total: 100000, items: [] });
  });
});
