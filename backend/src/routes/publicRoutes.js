import express from 'express';
import Court        from '../models/Court.js';
import Reservation  from '../models/Reservation.js';
import ScheduleRule  from '../models/ScheduleRule.js';
import ScheduleBlock from '../models/ScheduleBlock.js';
import User         from '../models/User.js';
import {
  ALL_SLOTS, toMinutes, getDayOfWeek,
  resolveSchedule, getBlockedSlots, getValidStartSlots,
} from '../utils/scheduleUtils.js';
import { transitionReservationPayment } from '../lib/reservationStateMachine.js';
import { createPaymentLink, getPaymentProvider } from '../lib/payments/index.js';
import { hasModule, MODULES } from '../lib/moduleEntitlements.js';
import { emitCourtEvent } from '../lib/emitCourtEvent.js'; 

const router = express.Router();

function emitReservationEvent(req, publicRef, payload = {}) {
  const io = req.app.get('io');
  if (!io || !publicRef) return;
  io.to(`reservation:${publicRef}`).emit('reservation:updated', payload);
}

function buildPublicRef() {
  return `RSV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}

// ── Court Directory ───────────────────────────────────────────────────────────

// GET /api/public/courts — landing page listing
router.get('/courts', async (req, res) => {
  try {
    const courts = await Court.find({
      isActive: true,
      'subscription.status': { $in: ['active', 'trial'] },
    }).select('name slug sports courtCount location contact description logoUrl amenities settings.hourlyRate settings.currency subscription.tier subscription.modules').lean();
    res.json(courts.filter(court => hasModule(court, MODULES.BOOKING)));
  } catch (err) {
    if (String(err.message || '').includes('Invalid reservation status transition') ||
        String(err.message || '').includes('Invalid payment status transition')) {
      return res.status(409).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

// GET /api/public/courts/id/:id — fetch by ObjectId (used by auth.ts JWT callback)
router.get('/courts/id/:id', async (req, res) => {
  try {
    const court = await Court.findById(req.params.id).select('name slug logoUrl').lean();
    if (!court) return res.status(404).json({ error: 'Court not found.' });
    res.json(court);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/public/courts/:slug — single court for booking page
router.get('/courts/:slug', async (req, res) => {
  try {
    const court = await Court.findOne({ slug: req.params.slug, isActive: true })
      .select('name slug sports courtCount location contact description logoUrl amenities settings subscription.tier subscription.modules')
      .lean();
    if (!court) return res.status(404).json({ error: 'Court not found.' });
    res.json(court);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/public/courts/:slug/availability?date=YYYY-MM-DD&duration=1
router.get('/courts/:slug/availability', async (req, res) => {
  try {
    const { date, duration = '1' } = req.query;
    if (!date) return res.status(400).json({ error: 'date is required' });

    const court = await Court.findOne({ slug: req.params.slug, isActive: true }).lean();
    if (!court) return res.status(404).json({ error: 'Court not found.' });
    if (!hasModule(court, MODULES.BOOKING)) {
      return res.status(403).json({ code: 'MODULE_NOT_ENABLED', module: MODULES.BOOKING, error: 'Booking is not enabled for this court.' });
    }

    const courtId     = court._id;
    const durationHrs = Math.max(1, parseInt(duration, 10));
    const dayOfWeek   = getDayOfWeek(date);

    const [rule, blocks, activeReservations] = await Promise.all([
      ScheduleRule.findOne({ courtId, dayOfWeek }).lean(),
      ScheduleBlock.find({ courtId, date }).lean(),
      Reservation.find({ courtId, date, status: { $in: ['pending', 'pending_admin', 'approved_waiting_payment', 'payment_processing', 'payment_received', 'confirmed', 'completed'] } })
        .select('court timeSlot duration').lean(),
    ]);

    const { isFullyClosed, baseSlots, perCourt } = resolveSchedule(rule, blocks);

    const nowUtc    = new Date();
    const phOffset  = 8 * 60;
    const phMins    = (nowUtc.getUTCHours() * 60 + nowUtc.getUTCMinutes() + phOffset) % (24 * 60);
    const phDateStr = new Date(nowUtc.getTime() + phOffset * 60 * 1000).toISOString().slice(0, 10);
    const isToday   = date === phDateStr;

    const validBase = baseSlots.filter(slot => {
      const startMins = toMinutes(slot.split('-')[0]);
      if (startMins + durationHrs * 60 > 23 * 60) return false;
      if (isToday && startMins + 60 <= phMins) return false;
      return true;
    });

    const courtNums = Array.from({ length: court.courtCount }, (_, i) => i + 1);
    const result = courtNums.map(courtNum => {
      if (isFullyClosed) return { court: courtNum, isFullyClosed: true, availableSlots: [], blockedSlots: ALL_SLOTS };
      const adminBlocked       = perCourt[courtNum]?.adminBlockedSlots ?? [];
      const openForThisCourt   = getValidStartSlots(validBase, durationHrs, adminBlocked);
      const reservationBlocked = getBlockedSlots(
        activeReservations.filter(r => r.court === courtNum),
        openForThisCourt, durationHrs
      );
      return {
        court: courtNum,
        isFullyClosed: false,
        availableSlots: openForThisCourt.filter(s => !reservationBlocked.includes(s)),
        blockedSlots: [
          ...ALL_SLOTS.filter(s => !openForThisCourt.includes(s)),
          ...adminBlocked,
          ...reservationBlocked,
        ],
      };
    });

    res.json({ isFullyClosed, courts: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/public/courts/:slug/schedule
router.get('/courts/:slug/schedule', async (req, res) => {
  try {
    const court = await Court.findOne({ slug: req.params.slug }).lean();
    if (!court) return res.status(404).json({ error: 'Court not found.' });
    const rules = await ScheduleRule.find({ courtId: court._id }).sort({ dayOfWeek: 1 }).lean();
    const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    res.json(rules.map(r => ({ ...r, dayName: DAY_NAMES[r.dayOfWeek] })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/public/courts/:slug/reserve — public booking
router.post('/courts/:slug/reserve', async (req, res) => {
  try {
    const court = await Court.findOne({ slug: req.params.slug, isActive: true }).lean();
    if (!court) return res.status(404).json({ error: 'Court not found.' });
    if (!hasModule(court, MODULES.BOOKING)) {
      return res.status(403).json({ code: 'MODULE_NOT_ENABLED', module: MODULES.BOOKING, error: 'Booking is not enabled for this court.' });
    }
    if (['expired', 'suspended'].includes(court.subscription.status)) {
      return res.status(403).json({ error: 'This court is not accepting bookings.' });
    }

    const {
      courtNum, date, timeSlot, duration = 1, name, phone, email = '', playerCount = 2, notes = '',
      paymentOption = 'downpayment',
    } = req.body;
    if (!courtNum || !date || !timeSlot || !name || !phone) {
      return res.status(400).json({ error: 'courtNum, date, timeSlot, name, and phone are required.' });
    }

    const courtId   = court._id;
    const durationHours = Number(duration);
    const startMins = toMinutes(timeSlot.split('-')[0]);
    const endMins   = startMins + durationHours * 60;
    if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 24 || !Number.isInteger(startMins) || startMins % 60 !== 0) {
      return res.status(400).json({ error: 'Invalid booking time or duration.' });
    }
    const dayOfWeek = getDayOfWeek(date);

    const [rule, blocks] = await Promise.all([
      ScheduleRule.findOne({ courtId, dayOfWeek }).lean(),
      ScheduleBlock.find({ courtId, date }).lean(),
    ]);

    const { isFullyClosed, baseSlots, perCourt } = resolveSchedule(rule, blocks);
    if (isFullyClosed) return res.status(403).json({ error: 'The venue is closed on this date.' });

    const startHour   = Math.floor(startMins / 60);
    const baseSlotKey = `${String(startHour).padStart(2,'0')}:00-${String(startHour+1).padStart(2,'0')}:00`;
    const adminBlockedSlots = perCourt[courtNum]?.adminBlockedSlots ?? [];
    if (!getValidStartSlots(baseSlots, durationHours, adminBlockedSlots).includes(baseSlotKey)) {
      if (!baseSlots.includes(baseSlotKey)) return res.status(403).json({ error: 'Outside open hours.' });
      return res.status(403).json({ error: 'This slot has been blocked.' });
    }

    const active = await Reservation.find({
      courtId, court: courtNum, date, status: { $in: ['pending', 'pending_admin', 'approved_waiting_payment', 'payment_processing', 'payment_received', 'confirmed', 'completed'] }
    }).select('timeSlot duration').lean();

    const hasConflict = active.some(e => {
      const exStart = toMinutes(e.timeSlot.split('-')[0]);
      const exEnd   = exStart + e.duration * 60;
      return startMins < exEnd && endMins > exStart;
    });
    if (hasConflict) return res.status(409).json({ error: 'This slot is already booked.' });

    const reservationFeeAmount = Number(court?.settings?.hourlyRate ?? court?.settings?.reservationFee ?? 0) * Number(duration);
    const downpaymentAmount = Number((reservationFeeAmount * 0.5).toFixed(2));
    const maintenanceFeeAmount = Number((reservationFeeAmount * 0.01).toFixed(2));

    const endHour = String(Math.floor(endMins / 60)).padStart(2,'0');
    const endMin  = String(endMins % 60).padStart(2,'0');
    const reservation = await Reservation.create({
      courtId,
      court:       Number(courtNum),
      date, name, phone, email, playerCount, notes,
      timeSlot:    `${timeSlot.split('-')[0]}-${endHour}:${endMin}`,
      bookingSlots: Array.from({ length: durationHours }, (_, offset) => String(startMins + offset * 60).padStart(4, '0')),
      duration:    Number(duration),
      status:      'approved_waiting_payment',
      publicRef:   buildPublicRef(),
      paymentOption: paymentOption === 'full' ? 'full' : 'downpayment',
      reservationFeeAmount,
      downpaymentAmount,
      maintenanceFeeAmount,
      remainingBalanceAmount: reservationFeeAmount,
    });

    const reservationStart = new Date(`${date}T${timeSlot.split('-')[0]}:00+08:00`);
    const holdExpiry = new Date(Date.now() + 10 * 60 * 1000);
    const in24h = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const expiryDate = [reservationStart, holdExpiry, in24h]
      .filter(d => !Number.isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const payableBase = reservation.paymentOption === 'full' ? reservationFeeAmount : downpaymentAmount;
    const amount = Number((payableBase + maintenanceFeeAmount).toFixed(2));
    const appBase = process.env.APP_BASE_URL || 'http://localhost:3000';
    const statusPath = `/book/${court.slug}/status/${reservation.publicRef}`;

    try {
      const paymentLink = await createPaymentLink({
        referenceId: `${reservation._id}-${Date.now()}`,
        amount,
        description: `Reservation ${reservation.publicRef}`,
        payerEmail: email,
        successUrl: `${appBase}${statusPath}`,
        failureUrl: `${appBase}${statusPath}`,
        expiryDate,
        metadata: { type: 'reservation', courtId: String(courtId), reservationId: String(reservation._id) },
      });
      transitionReservationPayment(reservation, 'approved_waiting_payment', 'awaiting_payment');
      reservation.paymentLinkId = paymentLink.id || paymentLink.payment_id || '';
      reservation.paymentUrl = paymentLink.payment_url || paymentLink.checkout_url || '';
      reservation.paymentQrString = paymentLink.qr_string || '';
      reservation.paymentExpiresAt = expiryDate;
      await reservation.save();
    } catch (paymentError) {
      await Reservation.deleteOne({ _id: reservation._id });
      throw paymentError;
    }

    req.courtId = String(courtId); 
    emitCourtEvent(req, 'reservation:updated', { action: 'created', reservationId: reservation._id, status: reservation.status });
    emitCourtEvent(req, 'analytics:refresh', { source: 'reservations' });

    res.status(201).json({
      ...reservation.toObject(),
      amountDue:
        (reservation.paymentOption === 'full' ? reservationFeeAmount : downpaymentAmount) + maintenanceFeeAmount,
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'This court time is currently being held for another payment session.' });
    }
    res.status(400).json({ error: err.message });
  }
});

router.get('/courts/:slug/reservations/:publicRef', async (req, res) => {
  try {
    const court = await Court.findOne({ slug: req.params.slug, isActive: true }).lean();
    if (!court) return res.status(404).json({ error: 'Court not found.' });

    const reservation = await Reservation.findOne({
      courtId: court._id,
      publicRef: req.params.publicRef,
    }).lean();
    if (!reservation) return res.status(404).json({ error: 'Reservation not found.' });

    const now = new Date();
    if (
      reservation.status === 'approved_waiting_payment' &&
      reservation.paymentExpiresAt &&
      new Date(reservation.paymentExpiresAt) <= now
    ) {
      transitionReservationPayment(reservation, 'expired', 'expired');
      await Reservation.updateOne(
        { _id: reservation._id },
        { $set: { status: reservation.status, paymentStatus: reservation.paymentStatus } }
      );
    }

    res.json({
      _id: reservation._id,
      publicRef: reservation.publicRef,
      name: reservation.name,
      court: reservation.court,
      date: reservation.date,
      timeSlot: reservation.timeSlot,
      duration: reservation.duration,
      status: reservation.status,
      paymentStatus: reservation.paymentStatus,
      paymentOption: reservation.paymentOption,
      reservationFeeAmount: reservation.reservationFeeAmount,
      downpaymentAmount: reservation.downpaymentAmount,
      maintenanceFeeAmount: reservation.maintenanceFeeAmount,
      amountPaidOnline: reservation.amountPaidOnline,
      remainingBalanceAmount: reservation.remainingBalanceAmount,
      paymentUrl: reservation.paymentUrl,
      paymentExpiresAt: reservation.paymentExpiresAt,
      mockPaymentAvailable: getPaymentProvider() === 'mock',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Development-only payment simulation for local testing without a merchant account.
router.post('/courts/:slug/reservations/:publicRef/mock-pay', async (req, res) => {
  try {
    if (getPaymentProvider() !== 'mock') return res.status(404).json({ error: 'Mock payments are disabled.' });
    const court = await Court.findOne({ slug: req.params.slug, isActive: true }).lean();
    if (!court) return res.status(404).json({ error: 'Court not found.' });
    const reservation = await Reservation.findOne({ courtId: court._id, publicRef: req.params.publicRef });
    if (!reservation) return res.status(404).json({ error: 'Reservation not found.' });
    if (reservation.status === 'pending_admin') {
      transitionReservationPayment(reservation, 'approved_waiting_payment', 'awaiting_payment');
    }
    if (reservation.status !== 'approved_waiting_payment' || reservation.paymentStatus !== 'awaiting_payment') {
      return res.status(409).json({ error: 'This reservation is not awaiting payment.' });
    }
    const payableBase = reservation.paymentOption === 'full'
      ? Number(reservation.reservationFeeAmount || 0)
      : Number(reservation.downpaymentAmount || 0);
    transitionReservationPayment(reservation, 'confirmed', 'paid');
    reservation.amountPaidOnline = payableBase + Number(reservation.maintenanceFeeAmount || 0);
    reservation.remainingBalanceAmount = Math.max(0, Number(reservation.reservationFeeAmount || 0) - payableBase);
    reservation.paidAt = new Date();
    await reservation.save();
    req.courtId = String(court._id);
    emitReservationEvent(req, reservation.publicRef, { action: 'paid', reservationId: reservation._id });
    emitCourtEvent(req, 'reservation:updated', { action: 'paid', reservationId: reservation._id, status: reservation.status });
    emitCourtEvent(req, 'analytics:refresh', { source: 'reservations' });
    res.json({ ok: true, status: reservation.status, paymentStatus: reservation.paymentStatus });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Court Registration (self-service onboarding) ──────────────────────────────

// POST /api/public/register-court — called from onboarding page
router.post('/register-court', async (req, res) => {
  try {
    const {
      name, slug, adminEmail,
      sports = ['badminton'], courtCount = 4,
      location = {}, contact = {},
    } = req.body;

    if (!name || !slug || !adminEmail) {
      return res.status(400).json({ error: 'name, slug, and adminEmail are required.' });
    }

    const existing = await Court.findOne({ slug: slug.toLowerCase() });
    if (existing) return res.status(409).json({ error: 'This slug is already taken.' });

    const court = await Court.create({
      name, slug, adminEmail, sports, courtCount,
      location, contact,
      subscription: { status: 'trial' },
      isPublic:     false,
      isActive:     true,
    });

    // Link or create the admin user
    await User.findOneAndUpdate(
      { email: adminEmail.toLowerCase() },
      {
        $set:         { courtId: court._id, role: 'admin' },
        $setOnInsert: { provider: 'google', name: '' },
      },
      { upsert: true, new: true }
    );

    res.status(201).json({
      success: true,
      courtId: court._id,
      slug:    court.slug,
      message: 'Court registered. Your 14-day trial has started.',
    });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Slug already taken.' });
    res.status(400).json({ error: err.message });
  }
});

export default router;