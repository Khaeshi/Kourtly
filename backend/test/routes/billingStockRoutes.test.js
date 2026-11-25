import request from 'supertest';
import app from '../../src/app.js';
import Court from '../../src/models/Court.js';
import Item from '../../src/models/Item.js';
import Match from '../../src/models/Match.js';
import Player from '../../src/models/Player.js';
import Reservation from '../../src/models/Reservation.js';
import ReservationTab from '../../src/models/ReservationTab.js';
import StockMovement from '../../src/models/StockMovement.js';
import Tab from '../../src/models/Tab.js';
import mongoose from 'mongoose';
import { recordBillingStockMovement } from '../../src/services/billingStock.js';

async function makeCourt() {
  return Court.create({
    name: 'Billing Stock Court',
    slug: `billing-stock-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    adminEmail: 'billing-stock@court.com',
    isActive: true,
    registrationStatus: 'approved',
    subscription: { status: 'active', tier: 'premium' },
    settings: { timezone: 'Asia/Manila' },
  });
}

async function makePlayer(courtId, name) {
  return Player.create({
    courtId,
    name,
    level: 'B',
    gender: 'Female',
    age: 25,
  });
}

function courtRequest(method, path, courtId) {
  return request(app)[method](path).set('x-court-id', String(courtId));
}

describe('billing inventory movements', () => {
  test('allows insufficient-stock sales with a shortfall warning without a negative balance', async () => {
    const court = await makeCourt();
    const player = await makePlayer(court._id, 'Shortfall Player');
    const item = await Item.create({
      courtId: court._id,
      name: 'Last drink',
      price: 20,
      trackStock: true,
      stockOnHand: 1,
      lowStockThreshold: 1,
    });
    const tab = await Tab.create({
      courtId: court._id,
      player: player._id,
      items: [],
      total: 0,
    });
    const emitted = [];
    app.set('io', {
      sockets: { adapter: { rooms: new Map([[`court:${court._id}`, new Set(['socket'])]]) } },
      to: room => ({
        emit: (event, payload) => emitted.push({ room, event, payload }),
      }),
    });

    try {
      const body = {
        itemId: String(item._id),
        quantity: 3,
        idempotencyKey: 'shortfall-sale',
      };
      const added = await courtRequest('post', `/api/tabs/${tab._id}/items`, court._id).send(body);
      expect(added.status).toBe(200);
      expect(added.body.stockWarning).toEqual({
        itemId: String(item._id),
        shortfall: 2,
      });
      expect((await Item.findById(item._id)).stockOnHand).toBe(0);

      const replay = await courtRequest('post', `/api/tabs/${tab._id}/items`, court._id).send(body);
      expect(replay.status).toBe(200);
      expect(replay.body.stockWarning).toEqual(added.body.stockWarning);
      expect((await Item.findById(item._id)).stockOnHand).toBe(0);
      expect(await StockMovement.countDocuments({ itemId: item._id, type: 'sale' })).toBe(1);

      const sale = await StockMovement.findOne({ itemId: item._id, type: 'sale' }).lean();
      expect(sale).toMatchObject({
        quantityDelta: -1,
        soldQuantityDelta: -3,
        stockWarning: { itemId: item._id, shortfall: 2 },
      });
      expect(emitted.some(event =>
        event.event === 'items:updated' &&
        event.payload.stockWarning?.itemId === String(item._id) &&
        event.payload.stockWarning.shortfall === 2
      )).toBe(true);

      const count = await courtRequest('post', '/api/items/stock/counts', court._id).send({
        idempotencyKey: 'shortfall-sale-count',
        items: [{ itemId: String(item._id), countedQuantity: 0 }],
      });
      expect(count.status).toBe(201);
      expect(count.body).toMatchObject({
        salesToday: 60,
        unitsSoldToday: 3,
        itemsMatched: 1,
        itemsShort: 0,
        itemsOver: 0,
      });

      const movementPage = await courtRequest(
        'get', `/api/items/${item._id}/stock/movements`, court._id
      );
      expect(movementPage.body.movements[0].stockWarning).toEqual({
        itemId: String(item._id),
        shortfall: 2,
      });

      const removed = await courtRequest(
        'delete', `/api/tabs/${tab._id}/items/0`, court._id
      );
      expect(removed.status).toBe(200);
      expect((await Item.findById(item._id)).stockOnHand).toBe(1);
      expect(await StockMovement.countDocuments({ itemId: item._id, type: 'void' })).toBe(1);

      const afterVoid = await courtRequest('post', '/api/items/stock/counts', court._id).send({
        idempotencyKey: 'shortfall-sale-count-after-void',
        items: [{ itemId: String(item._id), countedQuantity: 1 }],
      });
      expect(afterVoid.status).toBe(201);
      expect(afterVoid.body).toMatchObject({
        salesToday: 0,
        unitsSoldToday: 0,
        itemsMatched: 1,
      });

    } finally {
      app.set('io', null);
    }
  });

  test('multiple consecutive retries of the same sale key produce one movement and one warning', async () => {
    const court = await makeCourt();
    const player = await makePlayer(court._id, 'Sale Replay Player');
    const item = await Item.create({
      courtId: court._id,
      name: 'Sale replay drink',
      price: 20,
      trackStock: true,
      stockOnHand: 1,
    });
    const tab = await Tab.create({
      courtId: court._id,
      player: player._id,
      items: [],
      total: 0,
    });
    const body = {
      itemId: String(item._id),
      quantity: 3,
      idempotencyKey: 'multiple-sale-retries',
    };

    const first = await courtRequest('post', `/api/tabs/${tab._id}/items`, court._id).send(body);
    expect(first.status).toBe(200);
    expect(first.body.stockWarning).toEqual({
      itemId: String(item._id),
      shortfall: 2,
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const replay = await courtRequest('post', `/api/tabs/${tab._id}/items`, court._id).send(body);
      expect(replay.status).toBe(200);
      expect(replay.body.stockWarning).toEqual(first.body.stockWarning);
      expect((await Item.findById(item._id)).stockOnHand).toBe(0);
    }

    expect(await StockMovement.countDocuments({
      courtId: court._id,
      itemId: item._id,
      type: 'sale',
    })).toBe(1);
  });

  test('retried void reversal returns the original result and returns stock exactly once', async () => {
    const court = await makeCourt();
    const player = await makePlayer(court._id, 'Void Replay Player');
    const item = await Item.create({
      courtId: court._id,
      name: 'Replay drink',
      price: 20,
      trackStock: true,
      stockOnHand: 2,
    });
    const tab = await Tab.create({
      courtId: court._id,
      player: player._id,
      items: [],
      total: 0,
    });

    const added = await courtRequest('post', `/api/tabs/${tab._id}/items`, court._id).send({
      itemId: String(item._id),
      quantity: 1,
      idempotencyKey: 'void-replay-sale',
    });
    expect(added.status).toBe(200);
    expect((await Item.findById(item._id)).stockOnHand).toBe(1);

    const sale = await StockMovement.findOne({
      courtId: court._id,
      itemId: item._id,
      type: 'sale',
    }).lean();
    const line = (await Tab.findById(tab._id)).items[0];
    const req = {
      courtId: court._id,
      user: { _id: 'void-replay-staff' },
    };
    const session = await mongoose.startSession();
    let firstVoid;
    let replayVoid;
    try {
      await session.withTransaction(async () => {
        firstVoid = await recordBillingStockMovement({
          req,
          session,
          itemId: item._id,
          type: 'void',
          quantity: 1,
          unitPrice: 20,
          note: 'Void replay',
          tabType: 'queue',
          tabId: tab._id,
          tabLineId: line._id,
        });
        replayVoid = await recordBillingStockMovement({
          req,
          session,
          itemId: item._id,
          type: 'void',
          quantity: 1,
          unitPrice: 20,
          note: 'Void replay',
          tabType: 'queue',
          tabId: tab._id,
          tabLineId: line._id,
        });
      });
    } finally {
      await session.endSession();
    }

    expect(firstVoid).toMatchObject({
      itemId: item._id,
      type: 'void',
      stockOnHand: 2,
    });
    expect(replayVoid).toBeNull();
    expect((await Item.findById(item._id)).stockOnHand).toBe(2);
    expect(await StockMovement.countDocuments({
      courtId: court._id,
      itemId: item._id,
      type: 'void',
    })).toBe(1);
    const voidMovement = await StockMovement.findOne({
      courtId: court._id,
      itemId: item._id,
      type: 'void',
    }).lean();
    expect(voidMovement).toMatchObject({
      quantityDelta: 1,
      balanceAfter: 2,
    });
    expect(String(voidMovement.originalSaleAt)).toBe(String(sale.createdAt));
  });

  test('oversold sale then restock then void pins resulting balance and movement fields', async () => {
    const court = await makeCourt();
    const player = await makePlayer(court._id, 'Oversold Restock Void Player');
    const item = await Item.create({
      courtId: court._id,
      name: 'Oversold restock drink',
      price: 20,
      trackStock: true,
      stockOnHand: 1,
    });
    const tab = await Tab.create({
      courtId: court._id,
      player: player._id,
      items: [],
      total: 0,
    });

    const sold = await courtRequest('post', `/api/tabs/${tab._id}/items`, court._id).send({
      itemId: String(item._id),
      quantity: 3,
      idempotencyKey: 'oversold-restock-void-sale',
    });
    expect(sold.status).toBe(200);
    expect(sold.body.stockWarning).toEqual({
      itemId: String(item._id),
      shortfall: 2,
    });
    expect((await Item.findById(item._id)).stockOnHand).toBe(0);

    const restocked = await courtRequest(
      'post', `/api/items/${item._id}/stock/restock`, court._id
    ).send({
      quantity: 4,
      note: 'Restock before reversal',
      idempotencyKey: 'oversold-restock-before-void',
    });
    expect(restocked.status).toBe(200);
    expect(restocked.body.item.stockOnHand).toBe(4);

    const removed = await courtRequest(
      'delete', `/api/tabs/${tab._id}/items/0`, court._id
    );
    expect(removed.status).toBe(200);
    expect((await Item.findById(item._id)).stockOnHand).toBe(5);

    const sale = await StockMovement.findOne({
      courtId: court._id,
      itemId: item._id,
      type: 'sale',
    }).lean();
    expect(sale).toMatchObject({
      quantityDelta: -1,
      soldQuantityDelta: -3,
      balanceAfter: 0,
      stockWarning: { itemId: item._id, shortfall: 2 },
    });

    const reversal = await StockMovement.findOne({
      courtId: court._id,
      itemId: item._id,
      type: 'void',
    }).lean();
    expect(reversal).toMatchObject({
      quantityDelta: 1,
      soldQuantityDelta: 3,
      balanceAfter: 5,
    });
    expect(await StockMovement.countDocuments({
      courtId: court._id,
      itemId: item._id,
      type: 'void',
    })).toBe(1);
  });

  test('void at the 10000 balance limit leaves stock at the limit and creates no void', async () => {
    const court = await makeCourt();
    const player = await makePlayer(court._id, 'Void Limit Player');
    const item = await Item.create({
      courtId: court._id,
      name: 'Void limit drink',
      price: 20,
      trackStock: true,
      stockOnHand: 10000,
    });
    const tab = await Tab.create({
      courtId: court._id,
      player: player._id,
      items: [],
      total: 0,
    });

    const sold = await courtRequest('post', `/api/tabs/${tab._id}/items`, court._id).send({
      itemId: String(item._id),
      quantity: 1,
      idempotencyKey: 'void-at-limit-sale',
    });
    expect(sold.status).toBe(200);
    expect((await Item.findById(item._id)).stockOnHand).toBe(9999);

    const restocked = await courtRequest(
      'post', `/api/items/${item._id}/stock/restock`, court._id
    ).send({
      quantity: 1,
      note: 'Reach balance limit',
      idempotencyKey: 'reach-balance-limit',
    });
    expect(restocked.status).toBe(200);
    expect(restocked.body.item.stockOnHand).toBe(10000);

    const removed = await courtRequest(
      'delete', `/api/tabs/${tab._id}/items/0`, court._id
    );
    expect(removed.status).toBe(409);
    expect(removed.body.error).toBe(
      'Reversing this charge would exceed the supported stock balance.'
    );
    expect((await Item.findById(item._id)).stockOnHand).toBe(10000);
    expect(await StockMovement.countDocuments({
      courtId: court._id,
      itemId: item._id,
      type: 'void',
    })).toBe(0);
    expect((await Tab.findById(tab._id)).items).toHaveLength(1);
  });

  test('retains the existing billing line quantity limit of 100', async () => {
    const court = await makeCourt();
    const player = await makePlayer(court._id, 'Quantity Limit Player');
    const item = await Item.create({ courtId: court._id, name: 'Water', price: 1 });
    const tab = await Tab.create({
      courtId: court._id, player: player._id, items: [], total: 0,
    });

    const atLimit = await courtRequest('post', `/api/tabs/${tab._id}/items`, court._id).send({
      itemId: String(item._id), quantity: 100,
    });
    expect(atLimit.status).toBe(200);

    const overLimit = await courtRequest('post', `/api/tabs/${tab._id}/items`, court._id).send({
      itemId: String(item._id), quantity: 101,
    });
    expect(overLimit.status).toBe(400);
    expect((await Tab.findById(tab._id)).items).toHaveLength(1);
  });

  test('tab sales and removals create atomic sale and void movements; payment does not change stock', async () => {
    const court = await makeCourt();
    const player = await makePlayer(court._id, 'Tab Player');
    const item = await Item.create({
      courtId: court._id, name: 'Water', price: 25,
      trackStock: true, stockOnHand: 10,
    });
    const tab = await Tab.create({
      courtId: court._id, player: player._id, items: [], total: 0,
    });

    const added = await courtRequest('post', `/api/tabs/${tab._id}/items`, court._id).send({
      itemId: String(item._id), name: item.name, price: 25, quantity: 2,
    });
    expect(added.status).toBe(200);
    expect((await Item.findById(item._id)).stockOnHand).toBe(8);
    const sale = await StockMovement.findOne({ itemId: item._id, type: 'sale' }).lean();
    expect(sale).toMatchObject({
      quantityDelta: -2, unitPrice: 25, tabType: 'queue',
    });
    expect(String(sale.tabId)).toBe(String(tab._id));
    expect(String(sale.tabLineId)).toBe(added.body.items[0]._id);

    const unpaid = await courtRequest('put', `/api/tabs/${tab._id}/unpaid`, court._id);
    expect(unpaid.status).toBe(200);
    const paid = await courtRequest('put', `/api/tabs/${tab._id}/pay-unpaid`, court._id);
    expect(paid.status).toBe(200);
    expect((await Item.findById(item._id)).stockOnHand).toBe(8);

    const removed = await courtRequest('delete', `/api/tabs/${tab._id}/items/0`, court._id);
    expect(removed.status).toBe(200);
    expect(removed.body.items).toHaveLength(0);
    expect((await Item.findById(item._id)).stockOnHand).toBe(10);
    expect(await StockMovement.countDocuments({ itemId: item._id, type: 'void' })).toBe(1);
  });

  test('removing any member of a multi-player split removes sibling lines and restores one physical item', async () => {
    const court = await makeCourt();
    const players = await Promise.all([
      makePlayer(court._id, 'One'),
      makePlayer(court._id, 'Two'),
      makePlayer(court._id, 'Three'),
    ]);
    const item = await Item.create({
      courtId: court._id, name: 'Shuttlecock', price: 120,
      trackStock: true, stockOnHand: 5,
    });

    const splitBody = {
      itemId: String(item._id),
      name: 'Tampered name',
      price: 1,
      playerIds: players.map(player => String(player._id)),
      idempotencyKey: 'split-charge-once',
    };
    const split = await courtRequest('post', '/api/tabs/split', court._id).send(splitBody);
    const replay = await courtRequest('post', '/api/tabs/split', court._id).send(splitBody);
    expect(split.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(split.body).toHaveLength(3);
    expect(replay.body).toHaveLength(3);
    expect(split.body[0].items[0]).toMatchObject({
      name: 'Shuttlecock (split ÷3)',
      price: 40,
    });
    expect((await Item.findById(item._id)).stockOnHand).toBe(4);
    expect(await StockMovement.countDocuments({ itemId: item._id, type: 'sale' })).toBe(1);
    const chargeGroupIds = split.body.map(tab => tab.items[0].chargeGroupId);
    expect(new Set(chargeGroupIds).size).toBe(1);
    const sale = await StockMovement.findOne({ itemId: item._id, type: 'sale' }).lean();
    expect(sale).toMatchObject({ quantityDelta: -1, unitPrice: 120 });
    expect(sale.chargeGroupId).toBeTruthy();

    const removed = await courtRequest(
      'delete',
      `/api/tabs/${split.body[1]._id}/items/0`,
      court._id
    );
    expect(removed.status).toBe(200);
    expect((await Tab.find({ courtId: court._id })).every(tab => tab.items.length === 0)).toBe(true);
    expect((await Item.findById(item._id)).stockOnHand).toBe(5);
    expect(await StockMovement.countDocuments({ itemId: item._id, type: 'void' })).toBe(1);
  });

  test('split rejects foreign players and items before creating tabs', async () => {
    const court = await makeCourt();
    const otherCourt = await makeCourt();
    const players = await Promise.all([
      makePlayer(court._id, 'Local A'),
      makePlayer(court._id, 'Local B'),
      makePlayer(otherCourt._id, 'Foreign Player'),
    ]);
    const localItem = await Item.create({ courtId: court._id, name: 'Local item', price: 30 });
    const foreignItem = await Item.create({ courtId: otherCourt._id, name: 'Foreign item', price: 30 });

    const foreignPlayer = await courtRequest('post', '/api/tabs/split', court._id).send({
      itemId: String(localItem._id),
      playerIds: [String(players[0]._id), String(players[2]._id)],
    });
    expect(foreignPlayer.status).toBe(400);
    expect(JSON.stringify(foreignPlayer.body)).not.toContain('Foreign Player');

    const foreignItemResponse = await courtRequest('post', '/api/tabs/split', court._id).send({
      itemId: String(foreignItem._id),
      playerIds: [String(players[0]._id), String(players[1]._id)],
    });
    expect(foreignItemResponse.status).toBe(400);
    expect(JSON.stringify(foreignItemResponse.body)).not.toContain('Foreign item');
    await expect(Tab.countDocuments({ courtId: court._id })).resolves.toBe(0);
  });

  test('queue shuttlecock auto-split decrements one item and emits a billing update', async () => {
    const court = await makeCourt();
    const players = await Promise.all([
      makePlayer(court._id, 'A'), makePlayer(court._id, 'B'),
      makePlayer(court._id, 'C'), makePlayer(court._id, 'D'),
    ]);
    const item = await Item.create({
      courtId: court._id, name: 'Match shuttle', price: 100,
      isSplittable: true, trackStock: true, stockOnHand: 3,
    });
    const emitted = [];
    app.set('io', {
      sockets: { adapter: { rooms: new Map([[`court:${court._id}`, new Set(['socket'])]]) } },
      to: room => ({
        emit: (event, payload) => emitted.push({ room, event, payload }),
      }),
    });

    try {
      const response = await courtRequest('post', '/api/queue', court._id).send({
        team1: players.slice(0, 2).map(player => String(player._id)),
        team2: players.slice(2).map(player => String(player._id)),
        matchType: 'MD',
        court: 1,
        shuttlecockId: String(item._id),
      });
      expect(response.status).toBe(201);
      expect(await Match.countDocuments({ courtId: court._id })).toBe(1);
      expect(await Tab.countDocuments({ courtId: court._id })).toBe(4);
      const shuttleTabs = await Tab.find({ courtId: court._id }).lean();
      expect(shuttleTabs.every(tab =>
        tab.items[0].name === 'Match shuttle (÷4)' && tab.items[0].price === 25
      )).toBe(true);
      expect((await Item.findById(item._id)).stockOnHand).toBe(2);
      expect(await StockMovement.countDocuments({ itemId: item._id, type: 'sale' })).toBe(1);
      expect(emitted.some(event =>
        event.event === 'billing:tab_updated' &&
        event.payload.action === 'queue_shuttlecock_split' &&
        event.payload.tabIds.length === 4
      )).toBe(true);
      expect(emitted.some(event =>
        event.event === 'items:updated' &&
        event.payload.action === 'stock_sale' &&
        event.payload.stockOnHand === 2
      )).toBe(true);
    } finally {
      app.set('io', null);
    }
  });

  test('queue rejects a foreign shuttlecock item before creating the match', async () => {
    const court = await makeCourt();
    const otherCourt = await makeCourt();
    const players = await Promise.all([
      makePlayer(court._id, 'A'), makePlayer(court._id, 'B'),
      makePlayer(court._id, 'C'), makePlayer(court._id, 'D'),
    ]);
    const item = await Item.create({
      courtId: otherCourt._id, name: 'Foreign shuttle', price: 100,
      isSplittable: true, trackStock: true, stockOnHand: 3,
    });

    const response = await courtRequest('post', '/api/queue', court._id).send({
      team1: players.slice(0, 2).map(player => String(player._id)),
      team2: players.slice(2).map(player => String(player._id)),
      matchType: 'MD',
      court: 1,
      shuttlecockId: String(item._id),
    });

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).not.toContain('Foreign shuttle');
    await expect(Match.countDocuments({ courtId: court._id })).resolves.toBe(0);
    await expect(Tab.countDocuments({ courtId: court._id })).resolves.toBe(0);
    const updatedPlayers = await Player.find({ _id: { $in: players.map(player => player._id) } }).lean();
    expect(updatedPlayers.every(player => player.matchCount === 0)).toBe(true);
    expect((await Item.findById(item._id)).stockOnHand).toBe(3);
  });

  test('reservation tab add, remove, and clear paths update tracked stock', async () => {
    const court = await makeCourt();
    const reservation = await Reservation.create({
      courtId: court._id, name: 'Guest', phone: '09170000000',
      court: 1, date: '2026-11-11', timeSlot: '10:00-11:00',
      duration: 1, status: 'confirmed',
    });
    const tab = await ReservationTab.create({
      courtId: court._id,
      reservation: reservation._id,
      guestName: reservation.name,
      court: 1, date: reservation.date, timeSlot: reservation.timeSlot,
      items: [], total: 0,
    });
    const item = await Item.create({
      courtId: court._id, name: 'Drink', price: 30,
      trackStock: true, stockOnHand: 5,
    });

    const added = await courtRequest('post', `/api/reservation-tabs/${tab._id}/items`, court._id).send({
      itemId: String(item._id), name: item.name, price: 30, quantity: 1,
    });
    expect(added.status).toBe(200);
    expect((await Item.findById(item._id)).stockOnHand).toBe(4);
    await courtRequest('put', `/api/reservation-tabs/${tab._id}/unpaid`, court._id);
    await courtRequest('put', `/api/reservation-tabs/${tab._id}/pay-unpaid`, court._id);
    expect((await Item.findById(item._id)).stockOnHand).toBe(4);

    const removed = await courtRequest('delete', `/api/reservation-tabs/${tab._id}/items/0`, court._id);
    expect(removed.status).toBe(200);
    expect((await Item.findById(item._id)).stockOnHand).toBe(5);

    await courtRequest('post', `/api/reservation-tabs/${tab._id}/items`, court._id).send({
      itemId: String(item._id), name: item.name, price: 30, quantity: 2,
    });
    const cleared = await courtRequest('delete', `/api/reservation-tabs/${tab._id}`, court._id);
    expect(cleared.status).toBe(200);
    expect((await Item.findById(item._id)).stockOnHand).toBe(5);
    expect((await ReservationTab.findById(tab._id)).items).toHaveLength(0);
  });

  test('concurrent tab charges remain atomic and never drive stock below zero', async () => {
    const court = await makeCourt();
    const [playerA, playerB] = await Promise.all([
      makePlayer(court._id, 'Staff A Customer'),
      makePlayer(court._id, 'Staff B Customer'),
    ]);
    const [tabA, tabB] = await Promise.all([
      Tab.create({ courtId: court._id, player: playerA._id, items: [], total: 0 }),
      Tab.create({ courtId: court._id, player: playerB._id, items: [], total: 0 }),
    ]);
    const item = await Item.create({
      courtId: court._id, name: 'Last drink', price: 20,
      trackStock: true, stockOnHand: 1,
    });

    const [responseA, responseB] = await Promise.all([
      courtRequest('post', `/api/tabs/${tabA._id}/items`, court._id).send({
        itemId: String(item._id), name: item.name, price: 20, quantity: 1,
      }),
      courtRequest('post', `/api/tabs/${tabB._id}/items`, court._id).send({
        itemId: String(item._id), name: item.name, price: 20, quantity: 1,
      }),
    ]);
    expect([responseA.status, responseB.status]).toEqual([200, 200]);
    expect((await Item.findById(item._id)).stockOnHand).toBe(0);
    expect(await StockMovement.countDocuments({ itemId: item._id, type: 'sale' })).toBe(2);
    const warnings = [responseA.body.stockWarning, responseB.body.stockWarning].filter(Boolean);
    expect(warnings).toEqual([{ itemId: String(item._id), shortfall: 1 }]);
    const listed = await courtRequest('get', '/api/items', court._id);
    expect(listed.body[0]).toMatchObject({ stockOnHand: 0, isLowStock: true });
  });

  test('deleting a tracked tab voids its remaining item lines', async () => {
    const court = await makeCourt();
    const player = await makePlayer(court._id, 'Delete Player');
    const item = await Item.create({
      courtId: court._id, name: 'Drink', price: 10,
      trackStock: true, stockOnHand: 3,
    });
    const tab = await Tab.create({ courtId: court._id, player: player._id, items: [], total: 0 });
    await courtRequest('post', `/api/tabs/${tab._id}/items`, court._id).send({
      itemId: String(item._id), name: item.name, price: 10, quantity: 2,
    });
    expect((await Item.findById(item._id)).stockOnHand).toBe(1);

    const deleted = await courtRequest('delete', `/api/tabs/${tab._id}`, court._id);
    expect(deleted.status).toBe(200);
    expect(await Tab.findById(tab._id)).toBeNull();
    expect((await Item.findById(item._id)).stockOnHand).toBe(3);
    const voidMovement = await StockMovement.findOne({ itemId: item._id, type: 'void' }).lean();
    expect(voidMovement.quantityDelta).toBe(2);
  });

  test('deleting a tab reverses tracked lines but not sales made before tracking began', async () => {
    const court = await makeCourt();
    const player = await makePlayer(court._id, 'Legacy Player');
    const untracked = await Item.create({ courtId: court._id, name: 'Legacy drink', price: 10 });
    const tab = await Tab.create({ courtId: court._id, player: player._id, items: [], total: 0 });

    await courtRequest('post', `/api/tabs/${tab._id}/items`, court._id).send({
      itemId: String(untracked._id), name: untracked.name, price: 10, quantity: 1,
    });
    await courtRequest('post', `/api/items/${untracked._id}/stock/start`, court._id).send({
      openingQuantity: 4, note: 'Physical count', idempotencyKey: 'legacy-opening',
    });

    const deleted = await courtRequest('delete', `/api/tabs/${tab._id}`, court._id);
    expect(deleted.status).toBe(200);
    expect((await Item.findById(untracked._id)).stockOnHand).toBe(4);
    expect(await StockMovement.countDocuments({ itemId: untracked._id, type: 'void' })).toBe(0);
  });
});
