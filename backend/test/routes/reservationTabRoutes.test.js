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
