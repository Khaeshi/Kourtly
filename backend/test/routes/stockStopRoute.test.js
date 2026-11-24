import express from 'express';
import request from 'supertest';
import stockRoutes from '../../src/routes/stockRoutes.js';
import Court from '../../src/models/Court.js';
import Item from '../../src/models/Item.js';

function countStopRoutes(router) {
  return router.stack.filter((layer) => {
    if (!layer.route) return false;
    return layer.route.path === '/:id/stock/stop'
      && Object.prototype.hasOwnProperty.call(layer.route.methods, 'post');
  }).length;
}

function createFreshStockApp(court, user) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.courtId = court._id;
    req.court = court;
    req.user = user;
    next();
  });
  app.use('/api/items', stockRoutes);
  return app;
}

async function makeTrackedItem() {
  const court = await Court.create({
    name: 'Fresh Stop Court',
    slug: `fresh-stop-court-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    adminEmail: 'fresh-stop@court.com',
    isActive: true,
    registrationStatus: 'approved',
    subscription: { status: 'active', tier: 'premium' },
    settings: { timezone: 'Asia/Manila' },
  });
  const item = await Item.create({
    courtId: court._id,
    name: 'Fresh Stop Item',
    price: 30,
    trackStock: true,
    stockOnHand: 10,
  });
  const user = { _id: 'fresh-stop-staff', email: 'fresh-stop-staff@court.com' };
  return { court, item, user };
}

describe('stock stop route registration', () => {
  test('is registered immediately after import', () => {
    expect(countStopRoutes(stockRoutes)).toBe(1);
  });

  test('stop works as the first stock request on a fresh app', async () => {
    const { court, item, user } = await makeTrackedItem();
    const app = createFreshStockApp(court, user);

    const response = await request(app)
      .post(`/api/items/${item._id}/stock/stop`)
      .send({ note: 'Stop on first request', idempotencyKey: 'fresh-stop-first' });

    expect(response.status).toBe(200);
    expect(response.body.item).toMatchObject({
      trackStock: false,
      leftNow: null,
    });
  });

  test('several adjust requests do not add stop route layers', async () => {
    const { court, item, user } = await makeTrackedItem();
    const app = createFreshStockApp(court, user);

    for (let index = 0; index < 3; index += 1) {
      const response = await request(app)
        .post(`/api/items/${item._id}/stock/adjust`)
        .send({
          quantityDelta: -1,
          note: `Adjustment ${index + 1}`,
          idempotencyKey: `fresh-stop-adjust-${index + 1}`,
        });
      expect(response.status).toBe(200);
    }

    expect(countStopRoutes(stockRoutes)).toBe(1);
  });
});
