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
    registrationStatus: 'approved',
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
    const foreignAdjustment = await courtRequest(
      'post', `/api/items/${otherItem._id}/stock/adjust`, court._id
    ).send({
      quantityDelta: 1,
      note: 'Foreign item',
      idempotencyKey: 'foreign-stock-adjust',
    });
    expect(foreignAdjustment.status).toBe(404);
  });

  test('bounds stock quantities and thresholds and rejects negative or over-limit balances', async () => {
    const court = await makeCourt();
    const [openingItem, openingOverItem, thresholdOverItem, restockItem, countItem, thresholdItem] =
      await Promise.all([
        Item.create({ courtId: court._id, name: 'Opening limit', price: 1 }),
        Item.create({ courtId: court._id, name: 'Opening over', price: 1 }),
        Item.create({ courtId: court._id, name: 'Threshold over', price: 1 }),
        Item.create({ courtId: court._id, name: 'Restock limit', price: 1, trackStock: true }),
        Item.create({ courtId: court._id, name: 'Count limit', price: 1, trackStock: true }),
        Item.create({ courtId: court._id, name: 'Threshold limit', price: 1 }),
      ]);

    const openingAtLimit = await courtRequest(
      'post', `/api/items/${openingItem._id}/stock/start`, court._id
    ).send({
      openingQuantity: 10000,
      lowStockThreshold: 10000,
      note: 'At the stock limit',
      idempotencyKey: 'stock-limit-opening',
    });
    expect(openingAtLimit.status).toBe(200);
    expect(openingAtLimit.body.item).toMatchObject({
      stockOnHand: 10000,
      lowStockThreshold: 10000,
    });

    const openingOverLimit = await courtRequest(
      'post', `/api/items/${openingOverItem._id}/stock/start`, court._id
    ).send({
      openingQuantity: 10001,
      lowStockThreshold: 0,
      note: 'Over the stock limit',
      idempotencyKey: 'stock-over-opening',
    });
    expect(openingOverLimit.status).toBe(400);

    const thresholdOverLimit = await courtRequest(
      'post', `/api/items/${thresholdOverItem._id}/stock/start`, court._id
    ).send({
      openingQuantity: 0,
      lowStockThreshold: 10001,
      note: 'Over the threshold limit',
      idempotencyKey: 'stock-over-threshold',
    });
    expect(thresholdOverLimit.status).toBe(400);

    const restockAtLimit = await courtRequest(
      'post', `/api/items/${restockItem._id}/stock/restock`, court._id
    ).send({
      quantity: 10000,
      note: 'At the stock limit',
      idempotencyKey: 'stock-limit-restock',
    });
    expect(restockAtLimit.status).toBe(200);
    expect(restockAtLimit.body.item.stockOnHand).toBe(10000);
    const restockReplay = await courtRequest(
      'post', `/api/items/${restockItem._id}/stock/restock`, court._id
    ).send({
      quantity: 10000,
      note: 'At the stock limit',
      idempotencyKey: 'stock-limit-restock',
    });
    expect(restockReplay.status).toBe(200);
    expect(restockReplay.body.item.stockOnHand).toBe(10000);

    const restockOverBalance = await courtRequest(
      'post', `/api/items/${restockItem._id}/stock/restock`, court._id
    ).send({
      quantity: 1,
      note: 'Over the balance limit',
      idempotencyKey: 'stock-over-balance-restock',
    });
    expect(restockOverBalance.status).toBe(409);

    const restockOverQuantity = await courtRequest(
      'post', `/api/items/${restockItem._id}/stock/restock`, court._id
    ).send({
      quantity: 10001,
      note: 'Over the quantity limit',
      idempotencyKey: 'stock-over-quantity-restock',
    });
    expect(restockOverQuantity.status).toBe(400);

    const decrementToZero = await courtRequest(
      'post', `/api/items/${restockItem._id}/stock/adjust`, court._id
    ).send({
      quantityDelta: -10000,
      note: 'Decrement to zero',
      idempotencyKey: 'stock-adjust-to-zero',
    });
    expect(decrementToZero.status).toBe(200);
    expect(decrementToZero.body.item.stockOnHand).toBe(0);

    const adjustToLimit = await courtRequest(
      'post', `/api/items/${restockItem._id}/stock/adjust`, court._id
    ).send({
      quantityDelta: 10000,
      note: 'Increase to limit',
      idempotencyKey: 'stock-adjust-to-limit',
    });
    expect(adjustToLimit.status).toBe(200);
    expect(adjustToLimit.body.item.stockOnHand).toBe(10000);

    const adjustOverBalance = await courtRequest(
      'post', `/api/items/${restockItem._id}/stock/adjust`, court._id
    ).send({
      quantityDelta: 1,
      note: 'Attempt to exceed limit',
      idempotencyKey: 'stock-adjust-over-balance',
    });
    expect(adjustOverBalance.status).toBe(409);

    const adjustDownAgain = await courtRequest(
      'post', `/api/items/${restockItem._id}/stock/adjust`, court._id
    ).send({
      quantityDelta: -10000,
      note: 'Return to zero',
      idempotencyKey: 'stock-adjust-down-again',
    });
    expect(adjustDownAgain.status).toBe(200);
    expect(adjustDownAgain.body.item.stockOnHand).toBe(0);

    const adjustBelowZero = await courtRequest(
      'post', `/api/items/${restockItem._id}/stock/adjust`, court._id
    ).send({
      quantityDelta: -1,
      note: 'Attempt to go below zero',
      idempotencyKey: 'stock-adjust-below-zero',
    });
    expect(adjustBelowZero.status).toBe(409);

    const adjustOverQuantity = await courtRequest(
      'post', `/api/items/${restockItem._id}/stock/adjust`, court._id
    ).send({
      quantityDelta: 10001,
      note: 'Over the adjustment limit',
      idempotencyKey: 'stock-adjust-over-limit',
    });
    expect(adjustOverQuantity.status).toBe(400);

    const countAtLimit = await courtRequest('post', '/api/items/stock/counts', court._id).send({
      idempotencyKey: 'stock-count-at-limit',
      items: [{ itemId: String(countItem._id), countedQuantity: 10000 }],
    });
    expect(countAtLimit.status).toBe(201);
    expect((await Item.findById(countItem._id)).stockOnHand).toBe(10000);

    const countNegative = await courtRequest('post', '/api/items/stock/counts', court._id).send({
      idempotencyKey: 'stock-count-negative',
      items: [{ itemId: String(countItem._id), countedQuantity: -1 }],
    });
    expect(countNegative.status).toBe(400);

    const countOverLimit = await courtRequest('post', '/api/items/stock/counts', court._id).send({
      idempotencyKey: 'stock-count-over-limit',
      items: [{ itemId: String(countItem._id), countedQuantity: 10001 }],
    });
    expect(countOverLimit.status).toBe(400);

    const thresholdAtLimit = await courtRequest('post', '/api/items', court._id).send({
      name: 'Threshold at limit',
      price: 1,
      lowStockThreshold: 10000,
    });
    expect(thresholdAtLimit.status).toBe(201);

    const thresholdUpdateOverLimit = await courtRequest(
      'put', `/api/items/${thresholdItem._id}`, court._id
    ).send({ lowStockThreshold: 10001 });
    expect(thresholdUpdateOverLimit.status).toBe(400);
  });

  test('accepts 200 count items and rejects a 201-item request', async () => {
    const court = await makeCourt();
    const items = await Item.insertMany(Array.from({ length: 200 }, (_, index) => ({
      courtId: court._id,
      name: `Count item ${index}`,
      price: 1,
      trackStock: true,
      stockOnHand: 0,
    })));

    const atLimit = await courtRequest('post', '/api/items/stock/counts', court._id).send({
      idempotencyKey: 'stock-count-array-at-limit',
      items: items.map(item => ({ itemId: String(item._id), countedQuantity: 0 })),
    });
    expect(atLimit.status).toBe(201);
    expect(atLimit.body.itemsMatched).toBe(200);
    expect(atLimit.body.items).toHaveLength(200);

    const overLimit = await courtRequest('post', '/api/items/stock/counts', court._id).send({
      idempotencyKey: 'stock-count-array-over-limit',
      items: Array.from({ length: 201 }, (_, index) => ({
        itemId: `not-looked-up-${index}`,
        countedQuantity: 0,
      })),
    });
    expect(overLimit.status).toBe(400);
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
    expect(await StockMovement.countDocuments({ itemId: item._id, type: 'count' })).toBe(1);
    expect((await Item.findById(item._id)).stockOnHand).toBe(8);
    const changedReplay = await courtRequest('post', '/api/items/stock/counts', court._id)
      .send({ ...body, items: [{ ...body.items[0], countedQuantity: 9 }] });
    expect(changedReplay.status).toBe(409);

    const latest = await courtRequest('get', '/api/items/stock/counts/latest', court._id);
    expect(latest.status).toBe(200);
    expect(latest.body.countId).toBe(result.body.countId);
  });

  test('item list reports stock metrics and generic CRUD cannot change stock tracking', async () => {
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
    const billingItems = await courtRequest('get', '/api/items', court._id);
    expect(billingItems.body[0]).toMatchObject({
      trackStock: true,
      stockOnHand: 5,
      lowStockThreshold: 2,
      isLowStock: false,
    });

    const trackedItemStock = { trackStock: true, stockOnHand: 5, lowStockThreshold: 2 };
    const initialItemCount = await Item.countDocuments({ courtId: court._id });
    for (const [field, value] of [['trackStock', true], ['stockOnHand', 99]]) {
      const rejected = await courtRequest('post', '/api/items', court._id).send({
        name: 'Rejected stock mutation', price: 200, [field]: value,
      });

      expect(rejected.status).toBe(400);
      expect(rejected.body.error).toBe(`${field} is not an allowed field.`);
      expect(await Item.countDocuments({ courtId: court._id })).toBe(initialItemCount);
      await expect(Item.findById(item._id).select('trackStock stockOnHand lowStockThreshold').lean())
        .resolves.toMatchObject(trackedItemStock);
    }

    const created = await courtRequest('post', '/api/items', court._id).send({
      name: 'Untracked fee', price: 200,
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      trackStock: false, stockOnHand: 0, lowStockThreshold: 0, leftNow: null, soldToday: 0,
    });

    const protectedFields = [
      ['trackStock', true],
      ['stockOnHand', 99],
    ];
    const storedStock = { trackStock: false, stockOnHand: 0, lowStockThreshold: 0 };

    for (const [field, value] of protectedFields) {
      const rejected = await courtRequest('post', '/api/items', court._id).send({
        name: `Rejected ${field}`, price: 100, [field]: value,
      });
      expect(rejected.status).toBe(400);
      expect(rejected.body).toEqual({ error: `${field} is not an allowed field.` });
      expect(await Item.findById(created.body._id).lean()).toMatchObject(storedStock);
      expect(await Item.countDocuments({ courtId: court._id })).toBe(2);
    }

    for (const [field, value] of protectedFields) {
      const rejected = await courtRequest('put', `/api/items/${created.body._id}`, court._id)
        .send({ [field]: value });
      expect(rejected.status).toBe(400);
      expect(rejected.body).toEqual({ error: `${field} is not an allowed field.` });
      expect(await Item.findById(created.body._id).lean()).toMatchObject(storedStock);
    }

    const thresholdCreated = await courtRequest('post', '/api/items', court._id).send({
      name: 'Threshold item', price: 100, lowStockThreshold: 4,
    });
    expect(thresholdCreated.status).toBe(201);
    expect(thresholdCreated.body).toMatchObject({
      trackStock: false, stockOnHand: 0, lowStockThreshold: 4,
    });

    const thresholdUpdated = await courtRequest('put', `/api/items/${created.body._id}`, court._id)
      .send({ lowStockThreshold: 6 });
    expect(thresholdUpdated.status).toBe(200);
    expect(thresholdUpdated.body).toMatchObject({
      trackStock: false, stockOnHand: 0, lowStockThreshold: 6,
    });
  });

  test('inventory routes retain the existing item-tabs tier gate', async () => {
    const court = await Court.create({
      name: 'Basic Court',
      slug: `basic-court-${Date.now()}`,
      adminEmail: 'basic@court.com',
      isActive: true,
      registrationStatus: 'approved',
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

  test('stops tracking without deleting history and can restart with a new opening count', async () => {
    const court = await makeCourt();
    const item = await Item.create({ courtId: court._id, name: 'Water', price: 30 });
    const started = await courtRequest('post', `/api/items/${item._id}/stock/start`, court._id)
      .send({ openingQuantity: 6, note: 'Opening', idempotencyKey: 'stop-open' });
    expect(started.status).toBe(200);

    const stopped = await courtRequest('post', `/api/items/${item._id}/stock/stop`, court._id)
      .send({ note: 'Court fee item', idempotencyKey: 'stop-water' });
    expect(stopped.status).toBe(200);
    expect(stopped.body.item).toMatchObject({ trackStock: false, leftNow: null });
    expect(await StockMovement.countDocuments({ courtId: court._id })).toBe(2);

    const restarted = await courtRequest('post', `/api/items/${item._id}/stock/start`, court._id)
      .send({ openingQuantity: 4, note: 'Recount', idempotencyKey: 'restart-water' });
    expect(restarted.status).toBe(200);
    expect(restarted.body.item).toMatchObject({ trackStock: true, leftNow: 4 });
  });

  test('court fees and services remain untracked by default', async () => {
    const court = await makeCourt();
    for (const category of ['court fee', 'services']) {
      const created = await courtRequest('post', '/api/items', court._id).send({
        name: `${category} item`,
        category,
        price: 100,
      });
      expect(created.status).toBe(201);
      expect(created.body.trackStock).toBe(false);
    }
  });
});
