import request from 'supertest';
import app from '../../src/app.js';
import Court from '../../src/models/Court.js';
import Reservation from '../../src/models/Reservation.js';
import ReservationTab from '../../src/models/ReservationTab.js';
import Item from '../../src/models/Item.js';

async function makeCourt() {
  return Court.create({
    name: 'RT Court',
    slug: `rt-court-${Date.now()}`,
    adminEmail: 'rt@court.com',
    isActive: true,
    registrationStatus: 'approved',
    subscription: { status: 'active', tier: 'premium' },
    courtCount: 4,
  });
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('reservation tab routes', () => {
  test('POST /api/reservation-tabs/from-reservation creates a tab explicitly', async () => {
    const court = await makeCourt();
    const reservation = await Reservation.create({
      courtId: court._id,
      name: 'Guest',
      phone: '09170000000',
      court: 1,
      date: todayStr(),
      timeSlot: '10:00-11:00',
      duration: 1,
      status: 'confirmed',
      paymentStatus: 'paid',
      reservationFeeAmount: 840,
      amountPaidOnline: 428.4,
      maintenanceFeeAmount: 8.4,
    });

    const res = await request(app)
      .post(`/api/reservation-tabs/from-reservation/${reservation._id}`)
      .set('x-court-id', String(court._id));

    expect(res.status).toBe(201);
    expect(String(res.body.reservation)).toBe(String(reservation._id));
    expect(res.body.total).toBe(420);
  });

  test('reservation tab item add uses the court item price and name', async () => {
    const court = await makeCourt();
    const reservation = await Reservation.create({
      courtId: court._id,
      name: 'Guest',
      phone: '09170000000',
      court: 1,
      date: todayStr(),
      timeSlot: '10:00-11:00',
      duration: 1,
      status: 'confirmed',
    });
    const tab = await ReservationTab.create({
      courtId: court._id,
      reservation: reservation._id,
      guestName: reservation.name,
      court: reservation.court,
      date: reservation.date,
      timeSlot: reservation.timeSlot,
      items: [],
      total: 0,
      status: 'open',
    });
    const item = await Item.create({ courtId: court._id, name: 'Server Drink', price: 30 });

    const body = {
      itemId: String(item._id),
      name: 'Tampered name',
      price: 0,
      quantity: 2,
      idempotencyKey: 'reservation-charge-once',
    };
    const response = await request(app)
      .post(`/api/reservation-tabs/${tab._id}/items`)
      .set('x-court-id', String(court._id))
      .send(body);
    const replay = await request(app)
      .post(`/api/reservation-tabs/${tab._id}/items`)
      .set('x-court-id', String(court._id))
      .send({ ...body, name: 'Changed retry name', price: 1 });

    expect(response.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(response.body.total).toBe(60);
    expect(response.body.items[0]).toMatchObject({
      item: String(item._id),
      name: 'Server Drink',
      price: 30,
      quantity: 2,
    });
    expect(replay.body.total).toBe(60);
    expect(replay.body.items).toHaveLength(1);
  });

  test('reservation tab item add rejects foreign item and tab IDs', async () => {
    const court = await makeCourt();
    const otherCourt = await makeCourt();
    const reservation = await Reservation.create({
      courtId: court._id,
      name: 'Guest',
      phone: '09170000000',
      court: 1,
      date: todayStr(),
      timeSlot: '10:00-11:00',
      status: 'confirmed',
    });
    const otherReservation = await Reservation.create({
      courtId: otherCourt._id,
      name: 'Other Guest',
      phone: '09170000001',
      court: 1,
      date: todayStr(),
      timeSlot: '11:00-12:00',
      status: 'confirmed',
    });
    const tab = await ReservationTab.create({
      courtId: court._id,
      reservation: reservation._id,
      guestName: reservation.name,
      court: 1,
      date: reservation.date,
      timeSlot: reservation.timeSlot,
      items: [],
      total: 0,
    });
    const foreignTab = await ReservationTab.create({
      courtId: otherCourt._id,
      reservation: otherReservation._id,
      guestName: otherReservation.name,
      court: 1,
      date: otherReservation.date,
      timeSlot: otherReservation.timeSlot,
      items: [],
      total: 0,
    });
    const localItem = await Item.create({ courtId: court._id, name: 'Local Drink', price: 20 });
    const foreignItem = await Item.create({ courtId: otherCourt._id, name: 'Foreign Drink', price: 20 });

    const foreignItemResponse = await request(app)
      .post(`/api/reservation-tabs/${tab._id}/items`)
      .set('x-court-id', String(court._id))
      .send({ itemId: String(foreignItem._id), quantity: 1 });
    expect(foreignItemResponse.status).toBe(400);
    expect(JSON.stringify(foreignItemResponse.body)).not.toContain('Foreign Drink');

    const foreignTabResponse = await request(app)
      .post(`/api/reservation-tabs/${foreignTab._id}/items`)
      .set('x-court-id', String(court._id))
      .send({ itemId: String(localItem._id), quantity: 1 });
    expect(foreignTabResponse.status).toBe(404);
    await expect(ReservationTab.findById(tab._id).lean()).resolves.toMatchObject({ total: 0, items: [] });
    await expect(ReservationTab.findById(foreignTab._id).lean()).resolves.toMatchObject({ total: 0, items: [] });
  });

  test.each([0, -1, 1.5, 101, null, {}, '2'])(
    'reservation tab item add rejects invalid quantity %o',
    async quantity => {
      const court = await makeCourt();
      const reservation = await Reservation.create({
        courtId: court._id,
        name: 'Guest',
        phone: '09170000000',
        court: 1,
        date: todayStr(),
        timeSlot: '10:00-11:00',
        status: 'confirmed',
      });
      const tab = await ReservationTab.create({
        courtId: court._id,
        reservation: reservation._id,
        guestName: reservation.name,
        court: 1,
        date: reservation.date,
        timeSlot: reservation.timeSlot,
        items: [],
        total: 0,
      });
      const item = await Item.create({ courtId: court._id, name: 'Drink', price: 20 });

      const response = await request(app)
        .post(`/api/reservation-tabs/${tab._id}/items`)
        .set('x-court-id', String(court._id))
        .send({ itemId: String(item._id), quantity });

      expect(response.status).toBe(400);
      await expect(ReservationTab.findById(tab._id).lean())
        .resolves.toMatchObject({ total: 0, items: [] });
    }
  );

  test('reservation tab item add enforces total cap and rejects dotted paths', async () => {
    const court = await makeCourt();
    const reservation = await Reservation.create({
      courtId: court._id,
      name: 'Guest',
      phone: '09170000000',
      court: 1,
      date: todayStr(),
      timeSlot: '10:00-11:00',
      status: 'confirmed',
    });
    const tab = await ReservationTab.create({
      courtId: court._id,
      reservation: reservation._id,
      guestName: reservation.name,
      court: 1,
      date: reservation.date,
      timeSlot: reservation.timeSlot,
      items: [],
      total: 100000,
    });
    const item = await Item.create({ courtId: court._id, name: 'Drink', price: 1 });

    const overLimit = await request(app)
      .post(`/api/reservation-tabs/${tab._id}/items`)
      .set('x-court-id', String(court._id))
      .send({ itemId: String(item._id), quantity: 1 });
    expect(overLimit.status).toBe(400);

    const dotted = await request(app)
      .post(`/api/reservation-tabs/${tab._id}/items`)
      .set('x-court-id', String(court._id))
      .send({ itemId: String(item._id), quantity: 1, 'total.value': 0 });
    expect(dotted.status).toBe(400);
    await expect(ReservationTab.findById(tab._id).lean())
      .resolves.toMatchObject({ total: 100000, items: [] });
  });

  test('PUT /api/reservation-tabs/:id/pay marks linked reservation completed', async () => {
    const court = await makeCourt();
    const reservation = await Reservation.create({
      courtId: court._id,
      name: 'Paid Guest',
      phone: '09170000001',
      court: 2,
      date: todayStr(),
      timeSlot: '11:00-12:00',
      duration: 1,
      status: 'confirmed',
    });
    const tab = await ReservationTab.create({
      courtId: court._id,
      reservation: reservation._id,
      guestName: reservation.name,
      court: reservation.court,
      date: reservation.date,
      timeSlot: reservation.timeSlot,
      duration: reservation.duration,
      items: [],
      total: 0,
      status: 'open',
    });

    const res = await request(app)
      .put(`/api/reservation-tabs/${tab._id}/pay`)
      .set('x-court-id', String(court._id));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('paid');

    const updatedReservation = await Reservation.findById(reservation._id).lean();
    expect(updatedReservation.status).toBe('completed');
  });
});
