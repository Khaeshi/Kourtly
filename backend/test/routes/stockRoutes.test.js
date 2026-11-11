import request from 'supertest';
import app from '../../src/app.js';
import Court from '../../src/models/Court.js';
import Item from '../../src/models/Item.js';
import StockCount from '../../src/models/StockCount.js';
import StockMovement from '../../src/models/StockMovement.js';
import { getCourtDayRange } from '../../src/services/itemStock.js';

async function makeCourt(name = 'Stock Court') {
  return Court.create({
    name,
    slug: `${name.toLowerCase().replaceAll(' ', '-')}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    adminEmail: 'stock@court.com',
    isActive: true,
    subscription: { status: 'active', tier: 'premium' },
    settings: { timezone: 'Asia/Manila' },
  });
}

function courtRequest(method, path, courtId) {
  return request(app)[method](path).set('x-court-id', String(courtId));
}

describe('stock routes', () => {
  test('enables tracking with an opening count and safely replays idempotent requests', async () => {
    const court = await makeCourt();
    const item = await Item.create({ courtId: court._id, name: 'Water', price: 30 });
    const body = {
      openingQuantity: 8,
      lowStockThreshold: 2,
      note: 'Opening count',
      idempotencyKey: 'opening-water-1',
    };

    const first = await courtRequest('post', `/api/items/${item._id}/stock/start`, court._id).send(body);
    expect(first.status).toBe(200);
    expect(first.body.item).toMatchObject({
      trackStock: true,
      stockOnHand: 8,
      lowStockThreshold: 2,
      leftNow: 8,
      soldToday: 0,
      isLowStock: false,
    });
    expect(first.body.movement).toMatchObject({
      type: 'opening',
      quantityDelta: 8,
      balanceAfter: 8,
      note: 'Opening count',
    });

    const replay = await courtRequest('post', `/api/items/${item._id}/stock/start`, court._id).send(body);
    expect(replay.status).toBe(200);
    expect(replay.body.item.stockOnHand).toBe(8);
    expect(await StockMovement.countDocuments({ courtId: court._id })).toBe(1);

    const conflict = await courtRequest('post', `/api/items/${item._id}/stock/start`, court._id)
      .send({ ...body, openingQuantity: 9 });
    expect(conflict.status).toBe(409);
  });

  test('records restocks and adjustments and returns a paginated, tenant-scoped movement log', async () => {
    const court = await makeCourt();
    const otherCourt = await makeCourt('Other Stock Court');
    const item = await Item.create({ courtId: court._id, name: 'Shuttle', price: 120 });
    const otherItem = await Item.create({ courtId: otherCourt._id, name: 'Other shuttle', price: 100 });

    await courtRequest('post', `/api/items/${item._id}/stock/start`, court._id).send({
      openingQuantity: 10, note: 'Opening', idempotencyKey: 'shuttle-open',
    });
    await courtRequest('post', `/api/items/${item._id}/stock/restock`, court._id).send({
      quantity: 4, note: 'New tube', idempotencyKey: 'shuttle-restock',
    });
    const adjustment = await courtRequest('post', `/api/items/${item._id}/stock/adjust`, court._id).send({
      quantityDelta: -1, note: 'One shuttle damaged', idempotencyKey: 'shuttle-adjust',
    });
    expect(adjustment.status).toBe(200);
    expect(adjustment.body.item.stockOnHand).toBe(13);

    const page = await courtRequest('get', `/api/items/${item._id}/stock/movements?page=1&limit=1`, court._id);
    expect(page.status).toBe(200);
    expect(page.body.movements).toHaveLength(1);
    expect(page.body.pagination).toMatchObject({ page: 1, limit: 1, total: 3, totalPages: 3 });

    const wrongTenant = await courtRequest('get', `/api/items/${otherItem._id}/stock/movements`, court._id);
    expect(wrongTenant.status).toBe(404);
  });

  test('counts stock, includes the court-day sales summary, and exposes the latest count', async () => {
    const court = await makeCourt();
    const item = await Item.create({
      courtId: court._id,
      name: 'Sports drink',
      price: 50,
      trackStock: true,
      stockOnHand: 10,
    });
    const day = getCourtDayRange(new Date(), court.settings.timezone);
    await StockMovement.create([
      {
        courtId: court._id, itemId: item._id, type: 'sale', quantityDelta: -3,
        balanceAfter: 7, unitPrice: 50, note: 'Tab sale', actorId: 'staff-1',
        idempotencyKey: 'sale-stock-drink', requestHash: 'sale-hash',
        createdAt: new Date(Math.max(day.start.getTime(), Date.now() - 60_000)),
      },
      {
        courtId: court._id, itemId: item._id, type: 'void', quantityDelta: 1,
        balanceAfter: 8, unitPrice: 50, note: 'Voided line', actorId: 'staff-1',
        idempotencyKey: 'void-stock-drink', requestHash: 'void-hash',
        createdAt: new Date(Math.max(day.start.getTime(), Date.now() - 30_000)),
      },
    ]);

    const body = {
      idempotencyKey: 'daily-count-1',
      items: [{ itemId: String(item._id), countedQuantity: 8, note: 'One bottle leaked' }],
    };
    const result = await courtRequest('post', '/api/items/stock/counts', court._id).send(body);
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      timezone: 'Asia/Manila',
      salesToday: 100,
      unitsSoldToday: 2,
      itemsMatched: 0,
      itemsShort: 1,
      itemsOver: 0,
    });
    expect(result.body.items[0]).toMatchObject({
      expectedQuantity: 10,
      countedQuantity: 8,
      difference: -2,
      note: 'One bottle leaked',
    });
    expect((await Item.findById(item._id)).stockOnHand).toBe(8);

    const replay = await courtRequest('post', '/api/items/stock/counts', court._id).send(body);
    expect(replay.status).toBe(201);
    expect(await StockCount.countDocuments({ courtId: court._id })).toBe(1);
    const changedReplay = await courtRequest('post', '/api/items/stock/counts', court._id)
      .send({ ...body, items: [{ ...body.items[0], countedQuantity: 9 }] });
    expect(changedReplay.status).toBe(409);

    const latest = await courtRequest('get', '/api/items/stock/counts/latest', court._id);
    expect(latest.status).toBe(200);
    expect(latest.body.countId).toBe(result.body.countId);
  });

  test('item list reports stock metrics and generic CRUD cannot bypass opening counts', async () => {
    const court = await makeCourt();
    const item = await Item.create({
      courtId: court._id, name: 'Water', price: 30,
      trackStock: true, stockOnHand: 5, lowStockThreshold: 2,
    });
    const day = getCourtDayRange(new Date(), court.settings.timezone);
    await StockMovement.create({
      courtId: court._id, itemId: item._id, type: 'sale', quantityDelta: -2,
      balanceAfter: 3, unitPrice: 30, note: 'Sale', actorId: 'staff-1',
      idempotencyKey: 'list-sale', requestHash: 'list-hash',
      createdAt: new Date(Math.max(day.start.getTime(), Date.now() - 10_000)),
    });

    const listed = await courtRequest('get', '/api/items/all', court._id);
    expect(listed.status).toBe(200);
    expect(listed.body[0]).toMatchObject({
      trackStock: true, stockOnHand: 5, soldToday: 2, leftNow: 5, isLowStock: false,
    });

    const created = await courtRequest('post', '/api/items', court._id).send({
      name: 'Untracked fee', price: 200, trackStock: true, stockOnHand: 99,
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ trackStock: false, stockOnHand: 0, leftNow: null, soldToday: 0 });

    const updated = await courtRequest('put', `/api/items/${created.body._id}`, court._id).send({
      trackStock: true, stockOnHand: 99,
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ trackStock: false, stockOnHand: 0 });
  });

  test('inventory routes retain the existing item-tabs tier gate', async () => {
    const court = await Court.create({
      name: 'Basic Court',
      slug: `basic-court-${Date.now()}`,
      adminEmail: 'basic@court.com',
      isActive: true,
      subscription: { status: 'active', tier: 'basic' },
    });
    const item = await Item.create({ courtId: court._id, name: 'Water', price: 30 });

    const response = await courtRequest('post', `/api/items/${item._id}/stock/start`, court._id).send({
      openingQuantity: 3, note: 'Opening', idempotencyKey: 'basic-opening',
    });
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: 'MODULE_NOT_ENABLED',
      module: 'item_tabs',
    });
    expect((await Item.findById(item._id)).trackStock).toBe(false);
  });

  test('court day boundaries use the court timezone rather than server time', () => {
    const range = getCourtDayRange(new Date('2025-01-02T18:00:00.000Z'), 'Asia/Manila');
    expect(range.date).toBe('2025-01-03');
    expect(range.start.toISOString()).toBe('2025-01-02T16:00:00.000Z');
    expect(range.end.toISOString()).toBe('2025-01-03T16:00:00.000Z');
  });
});
