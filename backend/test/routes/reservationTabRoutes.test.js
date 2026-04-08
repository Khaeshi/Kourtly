import request from 'supertest';
import app from '../../src/app.js';
import Court from '../../src/models/Court.js';
import Reservation from '../../src/models/Reservation.js';
import ReservationTab from '../../src/models/ReservationTab.js';

async function makeCourt() {
  return Court.create({
    name: 'RT Court',
    slug: `rt-court-${Date.now()}`,
    adminEmail: 'rt@court.com',
    isActive: true,
    subscription: { status: 'active' },
    courtCount: 4,
  });
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('reservation tab routes', () => {
  test('GET /api/reservation-tabs/today creates tabs for confirmed reservations', async () => {
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

    const res = await request(app)
      .get('/api/reservation-tabs/today')
      .set('x-court-id', String(court._id));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].reservation.toString()).toBe(String(reservation._id));
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
