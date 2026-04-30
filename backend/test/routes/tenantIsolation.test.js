import request from 'supertest';
import app from '../../src/app.js';
import Court from '../../src/models/Court.js';
import Player from '../../src/models/Player.js';
import Tab from '../../src/models/Tab.js';
import ScheduleBlock from '../../src/models/ScheduleBlock.js';
import ReservationTab from '../../src/models/ReservationTab.js';
import Reservation from '../../src/models/Reservation.js';
import Match from '../../src/models/Match.js';

async function makeCourt(name) {
  return Court.create({
    name,
    slug: `${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
    adminEmail: `${name.toLowerCase().replace(/\s+/g, '')}@court.com`,
    isActive: true,
    subscription: { status: 'active' },
    courtCount: 4,
  });
}

describe('tenant isolation (Court A cannot access Court B resources by id)', () => {
  test('DELETE /api/tabs/:id cannot delete another court tab', async () => {
    const courtA = await makeCourt('Court A');
    const courtB = await makeCourt('Court B');

    const playerB = await Player.create({
      courtId: courtB._id,
      name: 'Player B',
      level: 'B',
      gender: 'Male',
      age: 25,
    });

    const tabB = await Tab.create({
      courtId: courtB._id,
      player: playerB._id,
      items: [{ name: 'Water', price: 30, quantity: 1, addedAt: new Date() }],
      total: 30,
      status: 'open',
    });

    const res = await request(app)
      .delete(`/api/tabs/${tabB._id}`)
      .set('x-court-id', String(courtA._id));

    expect(res.status).toBe(404);
    const stillThere = await Tab.findById(tabB._id).lean();
    expect(stillThere).toBeTruthy();
  });

  test('DELETE /api/schedule/blocks/:id cannot delete another court block', async () => {
    const courtA = await makeCourt('Court A');
    const courtB = await makeCourt('Court B');

    const blockB = await ScheduleBlock.create({
      courtId: courtB._id,
      date: '2026-04-30',
      courts: [1],
      blockType: 'range',
      startTime: '10:00',
      endTime: '12:00',
      reason: 'Maintenance',
    });

    const res = await request(app)
      .delete(`/api/schedule/blocks/${blockB._id}`)
      .set('x-court-id', String(courtA._id));

    expect(res.status).toBe(404);
    const stillThere = await ScheduleBlock.findById(blockB._id).lean();
    expect(stillThere).toBeTruthy();
  });

  test('DELETE /api/reservation-tabs/:id/items/:idx cannot mutate another court reservation tab', async () => {
    const courtA = await makeCourt('Court A');
    const courtB = await makeCourt('Court B');

    const reservationB = await Reservation.create({
      courtId: courtB._id,
      court: 1,
      date: '2026-04-30',
      timeSlot: '10:00-11:00',
      duration: 1,
      name: 'Guest B',
      phone: '09170000000',
      status: 'confirmed',
      paymentStatus: 'paid',
      reservationFeeAmount: 500,
    });

    const tabB = await ReservationTab.create({
      courtId: courtB._id,
      reservation: reservationB._id,
      guestName: 'Guest B',
      court: 1,
      date: '2026-04-30',
      timeSlot: '10:00-11:00',
      duration: 1,
      items: [{ name: 'Drink', price: 50, quantity: 1, addedAt: new Date() }],
      total: 50,
      status: 'open',
      paymentSummary: { reservationFee: 500, paidOnline: 500, remainingBalance: 0, source: 'cocoart' },
    });

    const res = await request(app)
      .delete(`/api/reservation-tabs/${tabB._id}/items/0`)
      .set('x-court-id', String(courtA._id));

    expect(res.status).toBe(404);
    const reloaded = await ReservationTab.findById(tabB._id).lean();
    expect(reloaded.items).toHaveLength(1);
    expect(reloaded.total).toBe(50);
  });

  test('DELETE /api/queue/:id cannot delete another court match', async () => {
    const courtA = await makeCourt('Court A');
    const courtB = await makeCourt('Court B');

    const [p1, p2, p3, p4] = await Player.create([
      { courtId: courtB._id, name: 'P1', level: 'A', gender: 'Male', age: 20, matchCount: 0 },
      { courtId: courtB._id, name: 'P2', level: 'B', gender: 'Male', age: 21, matchCount: 0 },
      { courtId: courtB._id, name: 'P3', level: 'C', gender: 'Female', age: 22, matchCount: 0 },
      { courtId: courtB._id, name: 'P4', level: 'D', gender: 'Female', age: 23, matchCount: 0 },
    ]);

    const createRes = await request(app)
      .post('/api/queue')
      .set('x-court-id', String(courtB._id))
      .send({
        team1: [String(p1._id), String(p2._id)],
        team2: [String(p3._id), String(p4._id)],
        matchType: 'XD',
        court: 1,
      });
    expect(createRes.status).toBe(201);
    const matchId = createRes.body?._id;
    expect(matchId).toBeTruthy();

    const deleteRes = await request(app)
      .delete(`/api/queue/${matchId}`)
      .set('x-court-id', String(courtA._id));

    // Route returns { success: true } even when nothing is deleted (it checks match existence)
    expect(deleteRes.status).toBe(200);

    const stillThere = await Match.findById(matchId).lean();
    expect(stillThere).toBeTruthy();
  });
});

