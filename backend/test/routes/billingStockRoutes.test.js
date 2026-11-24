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

  test('concurrent tab charges remain atomic and may drive stock below zero', async () => {
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
    expect((await Item.findById(item._id)).stockOnHand).toBe(-1);
    expect(await StockMovement.countDocuments({ itemId: item._id, type: 'sale' })).toBe(2);
    const listed = await courtRequest('get', '/api/items', court._id);
    expect(listed.body[0]).toMatchObject({ stockOnHand: -1, isLowStock: true });
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
