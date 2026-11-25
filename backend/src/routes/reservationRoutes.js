import express from 'express';
import mongoose from 'mongoose';
import crypto from 'node:crypto';
import { Resend } from 'resend';
import Reservation   from '../models/Reservation.js';
import Court from '../models/Court.js';
import ScheduleRule  from '../models/ScheduleRule.js';
import ScheduleBlock from '../models/ScheduleBlock.js';
import { buildConfirmationEmail } from '../emails/confirmationEmail.js';
import {
  ALL_SLOTS,
  toMinutes,
  getDayOfWeek,
  resolveSchedule,
  getBlockedSlots,
  getValidStartSlots,
} from '../utils/scheduleUtils.js';
import { getCourtDayRange } from '../services/itemStock.js';
import { seedDefaultRules } from '../services/scheduleDefaults.js';
import { createPaymentLink, getPaymentProvider } from '../lib/payments/index.js';
import { emitCourtEvent } from '../lib/emitCourtEvent.js';
import { transitionReservationPayment } from '../lib/reservationStateMachine.js';
import { canAcceptOnlinePayments } from '../lib/xenditReadiness.js';

const router = express.Router();
const PAYMENT_HOLD_MINUTES = Math.max(1, Number(process.env.PAYMENT_HOLD_MINUTES || 10));
const ACTIVE_RESERVATION_STATUSES = [
  'pending',
  'pending_admin',
  'approved_waiting_payment',
  'payment_processing',
  'payment_received',
  'confirmed',
  'completed',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Given existing reservations for a court, return which start slots
 * are blocked for a new booking of `durationHours` length.
 */
async function sendConfirmationEmail(reservation) {
  // Lazy-init so dotenv has already loaded by the time this runs
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { to, subject, html } = buildConfirmationEmail(reservation);
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'noreply@yourdomain.com',
    to, subject, html,
  });
  console.log('[email] Confirmation sent');
}

function validDate(value) {
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) &&
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function localMinutes(now, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts
    .filter(part => part.type !== 'literal')
    .map(part => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

function slotKey(startMinutes) {
  const hour = Math.floor(startMinutes / 60);
  return `${String(hour).padStart(2, '0')}:00-${String(hour + 1).padStart(2, '0')}:00`;
}

function occupiedBookingSlots(startMinutes, duration) {
  return Array.from({ length: duration }, (_, offset) =>
    String(startMinutes + offset * 60).padStart(4, '0')
  );
}

function canonicalTimeSlot(startTime, endMinutes) {
  const endHour = String(Math.floor(endMinutes / 60)).padStart(2, '0');
  const endMinute = String(endMinutes % 60).padStart(2, '0');
  return `${startTime}-${endHour}:${endMinute}`;
}

function walkInError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get('/grid', async (req, res) => {
  try {
    const { date } = req.query;
    if (!validDate(date)) {
      return res.status(400).json({ error: 'date must be a valid YYYY-MM-DD date.' });
    }

    await seedDefaultRules(req.courtId);
    const courtCount = Math.max(1, Number(req.court?.courtCount) || 4);
    const dayOfWeek = getDayOfWeek(date);
    const [rule, blocks, reservations] = await Promise.all([
      ScheduleRule.findOne({ courtId: req.courtId, dayOfWeek }).lean(),
      ScheduleBlock.find({ courtId: req.courtId, date }).sort({ startTime: 1 }).lean(),
      Reservation.find({ courtId: req.courtId, date }).sort({ timeSlot: 1 }).lean(),
    ]);
    const { isFullyClosed, baseSlots, perCourt } =
      resolveSchedule(rule, blocks, courtCount);
    const courts = Array.from({ length: courtCount }, (_, index) => {
      const court = index + 1;
      const adminBlocked = perCourt[court]?.adminBlockedSlots ?? [];
      const openSlots = baseSlots.filter(slot => !adminBlocked.includes(slot));
      return {
        court,
        openSlots,
        blockedSlots: ALL_SLOTS.filter(slot => !openSlots.includes(slot)),
        reservations: reservations.filter(reservation => reservation.court === court),
      };
    });

    res.json({
      date,
      courtCount,
      timezone: req.court?.settings?.timezone || 'Asia/Manila',
      dayOfWeek,
      dayName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek],
      isFullyClosed,
      openSlots: baseSlots,
      blocks,
      courts,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/walk-in', async (req, res) => {
  let session;
  let reservation;
  let paymentLinkCreated = false;
  try {
    const {
      name,
      phone,
      email = '',
      court,
      date,
      startTime,
      duration = 1,
      playerCount = 1,
      paymentMode,
    } = req.body ?? {};
    const courtCount = Math.max(1, Number(req.court?.courtCount) || 4);
    const timezone = req.court?.settings?.timezone || 'Asia/Manila';

    if (typeof name !== 'string' || !name.trim() ||
        typeof phone !== 'string' || !phone.trim()) {
      return res.status(400).json({ error: 'name and phone are required.' });
    }
    if (!validDate(date)) {
      return res.status(400).json({ error: 'date must be a valid YYYY-MM-DD date.' });
    }
    if (!Number.isInteger(court) || court < 1 || court > courtCount) {
      return res.status(400).json({ error: `court must be between 1 and ${courtCount}.` });
    }
    if (typeof startTime !== 'string' || !/^(?:[01]\d|2[0-3]):00$/.test(startTime)) {
      return res.status(400).json({ error: 'startTime must be a valid whole-hour HH:00 time.' });
    }
    if (!Number.isInteger(duration) || duration < 1 || duration > 24 ||
        !Number.isInteger(playerCount) || playerCount < 1 || playerCount > 10) {
      return res.status(400).json({ error: 'duration or playerCount is invalid.' });
    }
    if (!['counter', 'payment_link'].includes(paymentMode)) {
      return res.status(400).json({ error: 'paymentMode must be counter or payment_link.' });
    }

    const now = new Date();
    const today = getCourtDayRange(now, timezone).date;
    if (date < today) return res.status(400).json({ error: 'Reservations cannot be created in the past.' });
    const startMinutes = toMinutes(startTime);
    const endMinutes = startMinutes + duration * 60;
    if (endMinutes > 23 * 60 ||
        (date === today && startMinutes + 60 <= localMinutes(now, timezone))) {
      return res.status(400).json({ error: 'Invalid booking time or duration.' });
    }

    const dayOfWeek = getDayOfWeek(date);
    await seedDefaultRules(req.courtId);
    const [rule, blocks] = await Promise.all([
      ScheduleRule.findOne({ courtId: req.courtId, dayOfWeek }).lean(),
      ScheduleBlock.find({ courtId: req.courtId, date }).lean(),
    ]);
    const { isFullyClosed, baseSlots, perCourt } =
      resolveSchedule(rule, blocks, courtCount);
    if (isFullyClosed) {
      return res.status(403).json({ error: 'The venue is closed on this date.' });
    }
    const courtBlocked = perCourt[court]?.adminBlockedSlots ?? [];
    if (!getValidStartSlots(baseSlots, duration, courtBlocked).includes(slotKey(startMinutes))) {
      if (!baseSlots.includes(slotKey(startMinutes))) {
        return res.status(403).json({ error: "This time is outside the venue's open hours." });
      }
      return res.status(403).json({ error: 'This time slot has been blocked by the venue.' });
    }

    const courtRecord = await Court.findById(req.courtId)
      .select('slug settings.hourlyRate settings.reservationFee xendit.status xendit.webhookConfigured +xendit.subAccountId')
      .lean();
    if (!courtRecord) return res.status(404).json({ error: 'Court not found.' });
    if (
      paymentMode === 'payment_link' &&
      getPaymentProvider() === 'xendit' &&
      !canAcceptOnlinePayments(courtRecord)
    ) {
      return res.status(409).json({ error: 'Online payment is not available for this venue yet.' });
    }

    const reservationFeeAmount = Number(
      courtRecord.settings?.hourlyRate ?? courtRecord.settings?.reservationFee ?? 0
    ) * duration;
    const downpaymentAmount = Number((reservationFeeAmount * 0.5).toFixed(2));
    const maintenanceFeeAmount = paymentMode === 'payment_link'
      ? Number((reservationFeeAmount * 0.01).toFixed(2))
      : 0;
    const bookingSlots = occupiedBookingSlots(startMinutes, duration);
    const startAt = new Date(`${date}T${startTime}:00+08:00`);
    const holdExpiry = new Date(now.getTime() + PAYMENT_HOLD_MINUTES * 60 * 1000);
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const paymentExpiresAt = new Date(
      [startAt, holdExpiry, in24Hours].sort((a, b) => a.getTime() - b.getTime())[0]
    );
    const statusPath = `/book/${courtRecord.slug}/status/`;
    const publicRef = `RSV-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`.toUpperCase();
    const amountDue = paymentMode === 'payment_link'
      ? Number((downpaymentAmount + maintenanceFeeAmount).toFixed(2))
      : reservationFeeAmount;

    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      const existing = await Reservation.find({
        courtId: req.courtId,
        court,
        date,
        status: { $in: ACTIVE_RESERVATION_STATUSES },
      }).select('timeSlot duration').session(session).lean();
      const conflicts = existing.some(entry => {
        const existingStart = toMinutes(entry.timeSlot.split('-')[0]);
        const existingEnd = existingStart + Number(entry.duration || 1) * 60;
        return startMinutes < existingEnd && endMinutes > existingStart;
      });
      if (conflicts) throw walkInError(409, 'This time slot overlaps with an existing booking.');

      const [created] = await Reservation.create([{
        courtId: req.courtId,
        name: name.trim(),
        phone: phone.trim(),
        email: typeof email === 'string' ? email.trim() : '',
        court,
        date,
        timeSlot: canonicalTimeSlot(startTime, endMinutes),
        bookingSlots,
        duration,
        playerCount,
        status: paymentMode === 'counter' ? 'confirmed' : 'approved_waiting_payment',
        paymentOption: paymentMode === 'counter' ? 'full' : 'downpayment',
        reservationFeeAmount,
        downpaymentAmount,
        maintenanceFeeAmount,
        amountPaidOnline: 0,
        remainingBalanceAmount: paymentMode === 'counter' ? 0 : reservationFeeAmount,
        adminNetAmount: paymentMode === 'counter' ? reservationFeeAmount : 0,
        paymentStatus: paymentMode === 'counter' ? 'paid' : 'awaiting_payment',
        paymentMethod: paymentMode === 'counter' ? 'counter' : '',
        paymentChannel: paymentMode === 'counter' ? 'counter' : '',
        paidAmount: paymentMode === 'counter' ? reservationFeeAmount : null,
        paidAt: paymentMode === 'counter' ? now : null,
        paymentExpiresAt: paymentMode === 'payment_link' ? paymentExpiresAt : null,
        paymentExpectedAmount: paymentMode === 'payment_link' ? amountDue : 0,
        publicRef,
      }], { session });
      reservation = created;
    });

    if (paymentMode === 'payment_link') {
      const externalId = `${reservation._id}-${Date.now()}`;
      const appBase = process.env.APP_BASE_URL || 'http://localhost:3000';
      try {
        const paymentLink = await createPaymentLink({
          referenceId: externalId,
          amount: amountDue,
          description: `Reservation ${reservation.publicRef}`,
          payerEmail: email,
          successUrl: `${appBase}${statusPath}${reservation.publicRef}`,
          failureUrl: `${appBase}${statusPath}${reservation.publicRef}`,
          expiryDate: paymentExpiresAt,
          metadata: {
            type: 'reservation',
            courtId: String(req.courtId),
            reservationId: String(reservation._id),
          },
          forUserId: courtRecord.xendit?.subAccountId,
        });
        paymentLinkCreated = true;
        reservation = await Reservation.findOneAndUpdate(
          { _id: reservation._id, courtId: req.courtId },
          {
            $set: {
              paymentLinkId: paymentLink.id || paymentLink.payment_id || '',
              paymentExternalId: externalId,
              paymentUrl: paymentLink.payment_url || paymentLink.checkout_url || '',
              paymentQrString: paymentLink.qr_string || '',
            },
          },
          { new: true, runValidators: true }
        );
        if (!reservation) throw new Error('Could not save the created payment link.');
      } catch (paymentError) {
        console.error('[walk-in] payment link setup failed:', paymentError.message);
        if (!paymentLinkCreated) {
          await Reservation.deleteOne({ _id: reservation._id, courtId: req.courtId });
        }
        throw new Error('Could not create the payment link. Please try again.');
      }
    }

    emitCourtEvent(req, 'reservation:updated', {
      action: 'created',
      reservationId: reservation._id,
      status: reservation.status,
    });
    emitCourtEvent(req, 'analytics:refresh', { source: 'reservations' });
    res.status(201).json({
      reservation: reservation.toObject(),
      paymentUrl: paymentMode === 'payment_link' ? reservation.paymentUrl : null,
      paymentExpiresAt: paymentMode === 'payment_link' ? reservation.paymentExpiresAt : null,
      amountDue,
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'This court time is currently held by another reservation.' });
    }
    res.status(err.status ?? 400).json({ error: err.message });
  } finally {
    if (session) await session.endSession();
  }
});

/**
 * GET /api/reservations
 * Admin: list all, supports ?date=&status= filters
 */
router.get('/', async (req, res) => {
  try {
    const { date, dateFrom, dateTo, status } = req.query;
    const isValidDate = value =>
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) &&
      new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;

    if ((dateFrom !== undefined && !isValidDate(dateFrom)) ||
        (dateTo !== undefined && !isValidDate(dateTo))) {
      return res.status(400).json({ error: 'dateFrom and dateTo must be valid YYYY-MM-DD dates.' });
    }
    if ((dateFrom === undefined) !== (dateTo === undefined)) {
      return res.status(400).json({ error: 'dateFrom and dateTo must be provided together.' });
    }
    if (dateFrom !== undefined && dateTo !== undefined) {
      const start = Date.parse(`${dateFrom}T00:00:00.000Z`);
      const end = Date.parse(`${dateTo}T00:00:00.000Z`);
      if (end < start) return res.status(400).json({ error: 'dateTo must not be before dateFrom.' });
      if ((end - start) / 86_400_000 >= 62) {
        return res.status(400).json({ error: 'The reservation date range may not exceed 62 days.' });
      }
    }

    const filter = { courtId: req.courtId };
    if (date) {
      filter.date = date;
    } else if (dateFrom || dateTo) {
      filter.date = {};
      if (dateFrom) filter.date.$gte = dateFrom;
      if (dateTo) filter.date.$lte = dateTo;
    }
    if (status && status !== 'all') filter.status = status;
    const query = Reservation.find(filter).sort({ date: 1, timeSlot: 1 });
    if (dateFrom !== undefined && dateTo !== undefined) {
      const reservations = await query.limit(2001).lean();
      if (reservations.length > 2000) {
        return res.status(413).json({
          error: 'Too many reservations in this range. Narrow the range.',
        });
      }
      return res.json(reservations);
    }
    const reservations = await query.lean();
    res.json(reservations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/reservations/availability?date=YYYY-MM-DD&duration=1
 * Public: returns availability per court, respecting:
 *   1. ScheduleRule (weekly open hours)
 *   2. ScheduleBlocks (admin date/court overrides)
 *   3. Existing reservations (overlap detection)
 */
router.get('/availability', async (req, res) => {
  try {
    const { date, duration = '1' } = req.query;
    if (!date) return res.status(400).json({ error: 'date is required' });

    const durationHours = Math.max(1, parseInt(duration, 10));
    const dayOfWeek     = getDayOfWeek(date);

    // Fetch schedule data and reservations in parallel
    const [rule, blocks, activeReservations] = await Promise.all([
      ScheduleRule.findOne({ courtId: req.courtId ,dayOfWeek }).lean(),
      ScheduleBlock.find({ courtId: req.courtId ,date }).lean(),
      Reservation.find({ courtId: req.courtId , date, status: { $in: ['confirmed', 'completed'] } })
        .select('court timeSlot duration').lean(),
    ]);

    const courtCount = Math.max(1, Number(req.court?.courtCount) || 4);
    const { isFullyClosed, baseSlots, perCourt } =
      resolveSchedule(rule, blocks, courtCount);

    // Current time in minutes — only relevant when date is today (use local PH time via offset)
    const nowUtc     = new Date();
    // PHT = UTC+8. Using getTime() + offset to get local mins without relying on server TZ
    const phOffset   = 8 * 60; // Philippines is UTC+8, no DST
    const phMins     = (nowUtc.getUTCHours() * 60 + nowUtc.getUTCMinutes() + phOffset) % (24 * 60);
    const phDateStr  = (() => {
      const phDate = new Date(nowUtc.getTime() + phOffset * 60 * 1000);
      return phDate.toISOString().slice(0, 10);
    })();
    const isToday    = date === phDateStr;

    // Filter base slots to those valid for the requested duration AND not fully in the past
    const validBase = baseSlots.filter(slot => {
      const startMins = toMinutes(slot.split('-')[0]);
      // Rule 1: slot + duration must not exceed 23:00
      if (startMins + durationHours * 60 > 23 * 60) return false;
      // Rule 2: for today, only block if the slot has completely ended (start + 1hr <= now)
      // This allows booking the currently-running hour slot
      if (isToday && startMins + 60 <= phMins) return false;
      return true;
    });

    const result = Array.from({ length: courtCount }, (_, index) => index + 1).map(courtNum => {
      if (isFullyClosed) {
        return { court: courtNum, isFullyClosed: true, availableSlots: [], blockedSlots: ALL_SLOTS };
      }

      const adminBlocked       = perCourt[courtNum]?.adminBlockedSlots ?? [];
      const openForThisCourt   = validBase.filter(s => !adminBlocked.includes(s));
      const reservationBlocked = getBlockedSlots(
        activeReservations.filter(r => r.court === courtNum),
        openForThisCourt,
        durationHours
      );

      const availableSlots = openForThisCourt.filter(s => !reservationBlocked.includes(s));

      return {
        court:        courtNum,
        isFullyClosed: false,
        availableSlots,
        blockedSlots: [
          ...ALL_SLOTS.filter(s => !openForThisCourt.includes(s)), // outside open hours or duration window
          ...adminBlocked,                                   // admin blocked
          ...reservationBlocked,                             // reserved
        ],
        // Breakdown for admin debugging (not needed by frontend but useful)
        _meta: {
          outsideHours:  ALL_SLOTS.filter(s => !validBase.includes(s)).length,
          adminBlocked:  adminBlocked.length,
          reserved:      reservationBlocked.length,
        },
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/reservations
 * Public: create a reservation — validates against schedule + overlaps
 */
router.post('/', async (req, res) => {
  try {
    const { court, date, timeSlot, duration = 1, name, phone } = req.body;
    if (!court || !date || !timeSlot || !name || !phone) {
      return res.status(400).json({ error: 'court, date, timeSlot, name, and phone are required.' });
    }

    const startMins = toMinutes(timeSlot.split('-')[0]);
    const durationHours = Number(duration);
    const endMins   = startMins + durationHours * 60;
    if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 24 || !Number.isInteger(startMins) || startMins % 60 !== 0) {
      return res.status(400).json({ error: 'Invalid booking time or duration.' });
    }
    const dayOfWeek = getDayOfWeek(date);

    // Validate against schedule
    const [rule, blocks] = await Promise.all([
      ScheduleRule.findOne({ courtId: req.courtId , dayOfWeek }).lean(),
      ScheduleBlock.find({ courtId: req.courtId , date }).lean(),
    ]);

    const courtCount = Math.max(1, Number(req.court?.courtCount) || 4);
    if (!Number.isInteger(court) || court < 1 || court > courtCount) {
      return res.status(400).json({ error: `court must be between 1 and ${courtCount}.` });
    }
    const { isFullyClosed, baseSlots, perCourt } =
      resolveSchedule(rule, blocks, courtCount);

    if (isFullyClosed) {
      return res.status(403).json({ error: 'The venue is closed on this date.' });
    }

    // Check slot is within open hours
    const slotKey = `${String(Math.floor(startMins/60)).padStart(2,'0')}:${String(startMins%60).padStart(2,'0')}-${String(Math.floor(startMins/60+1)).padStart(2,'0')}:${String(startMins%60).padStart(2,'0')}`;
    const startHour = Math.floor(startMins / 60);
    const baseSlotKey = `${String(startHour).padStart(2,'0')}:00-${String(startHour+1).padStart(2,'0')}:00`;

    const adminBlocked = perCourt[court].adminBlockedSlots;
    if (!getValidStartSlots(baseSlots, durationHours, adminBlocked).includes(baseSlotKey)) {
      if (!baseSlots.includes(baseSlotKey)) {
      return res.status(403).json({ error: 'This time is outside the venue\'s open hours.' });
      }
      return res.status(403).json({ error: 'This time slot has been blocked by the venue.' });
    }

    // Check reservation overlaps
    const active = await Reservation
      .find({ courtId: req.courtId, court, date, status: { $in: ['pending', 'pending_admin', 'approved_waiting_payment', 'payment_processing', 'payment_received', 'confirmed', 'completed'] } })
      .select('timeSlot duration').lean();

    const hasConflict = active.some(existing => {
      const exStart = toMinutes(existing.timeSlot.split('-')[0]);
      const exEnd   = exStart + existing.duration * 60;
      return startMins < exEnd && endMins > exStart;
    });

    if (hasConflict) {
      return res.status(409).json({ error: 'This time slot overlaps with an existing booking.' });
    }

    // Store canonical slot with actual end time
    const endHour = String(Math.floor(endMins / 60)).padStart(2, '0');
    const endMin  = String(endMins % 60).padStart(2, '0');
    const canonicalSlot = `${timeSlot.split('-')[0]}-${endHour}:${endMin}`;

    const reservation = await Reservation.create({
      ...req.body,
      timeSlot: canonicalSlot,
      bookingSlots: Array.from({ length: durationHours }, (_, offset) => String(startMins + offset * 60).padStart(4, '0')),
      duration: Number(duration),
    });

    emitCourtEvent(req, 'reservation:updated', { action: 'created', reservationId: reservation._id, status: reservation.status });
    emitCourtEvent(req, 'analytics:refresh', { source: 'reservations' });

    res.status(201).json(reservation);
  } catch (err) {
    if (String(err.message || '').includes('Invalid reservation status transition') ||
        String(err.message || '').includes('Invalid payment status transition')) {
      return res.status(409).json({ error: err.message });
    }
    res.status(400).json({ error: err.message });
  }
});

/**
 * PUT /api/reservations/:id
 * Admin: update status and/or notes — sends email on confirm
 */
router.put('/:id', async (req, res) => {
  try {
    const { status, notes } = req.body;
    const update = {};
    if (status !== undefined) {
      update.status = status;
      if (status === 'cancelled' || status === 'expired') update.$unset = { bookingSlots: 1 };
    }
    if (notes  !== undefined) update.notes  = notes;
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'Provide status or notes to update.' });
    }
    const reservation = await Reservation.findOneAndUpdate(
      { _id: req.params.id, courtId: req.courtId }, 
      update,
      { new: true, runValidators: true }
    );
    if (!reservation) return res.status(404).json({ error: 'Reservation not found.' });
    if (status === 'confirmed' && reservation.email) {
      sendConfirmationEmail(reservation).catch(err =>
        console.error('[email] Failed:', err.message)
      );
    }
    emitCourtEvent(req, 'reservation:updated', { action: 'updated', reservationId: reservation._id, status: reservation.status });
    emitCourtEvent(req, 'analytics:refresh', { source: 'reservations' });
    res.json(reservation);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/reservations/:id/approve-payment
 * Admin approves reservation and creates/reuses one payment intent.
 */
router.post('/:id/approve-payment', async (req, res) => {
  try {
    const reservation = await Reservation.findOne({
      _id: req.params.id,
      courtId: req.courtId,
    });
    if (!reservation) return res.status(404).json({ error: 'Reservation not found.' });
    if (['cancelled', 'expired', 'completed'].includes(reservation.status)) {
      return res.status(400).json({ error: 'Reservation is not payable anymore.' });
    }
    if (!['pending_admin', 'approved_waiting_payment'].includes(reservation.status)) {
      return res.status(409).json({ error: `Cannot approve payment from status "${reservation.status}".` });
    }
    const court = await Court.findById(reservation.courtId)
      .select('slug xendit.status xendit.webhookConfigured +xendit.subAccountId')
      .lean();
    if (!court?.slug) {
      return res.status(400).json({ error: 'Court slug not found for reservation payment redirect.' });
    }
    if (
      getPaymentProvider() === 'xendit' &&
      !canAcceptOnlinePayments(court)
    ) {
      return res.status(409).json({ error: 'Online payment is not available for this venue yet.' });
    }

    if (
      reservation.paymentStatus === 'awaiting_payment' &&
      reservation.paymentUrl &&
      reservation.paymentExpiresAt &&
      new Date(reservation.paymentExpiresAt) > new Date()
    ) {
      return res.json(reservation);
    }

    const reservationStart = new Date(`${reservation.date}T${reservation.timeSlot.split('-')[0]}:00+08:00`);
    const holdExpiry = new Date(Date.now() + PAYMENT_HOLD_MINUTES * 60 * 1000);
    const in24h = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const expiryDate = [reservationStart, holdExpiry, in24h]
      .filter((d) => d instanceof Date && !Number.isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const payableBase = reservation.paymentOption === 'full'
      ? Number(reservation.reservationFeeAmount || 0)
      : Number(reservation.downpaymentAmount || 0);
    const amount = Number((payableBase + Number(reservation.maintenanceFeeAmount || 0)).toFixed(2));

    const appBase = process.env.APP_BASE_URL || 'http://localhost:3000';
    const statusPath = `/book/${court.slug}/status/${reservation.publicRef}`;
    const externalId = `${reservation._id}-${Date.now()}`;
    const paymentLink = await createPaymentLink({
      referenceId: externalId,
      amount,
      description: `Reservation ${reservation.publicRef}`,
      payerEmail: reservation.email,
      successUrl: `${appBase}${statusPath}`,
      failureUrl: `${appBase}${statusPath}`,
      expiryDate,
      metadata: {
        type: 'reservation',
        courtId: String(reservation.courtId),
        reservationId: String(reservation._id),
      },
      forUserId: court.xendit?.subAccountId,
    });

    transitionReservationPayment(reservation, 'approved_waiting_payment', 'awaiting_payment');
    reservation.paymentLinkId = paymentLink.id || paymentLink.payment_id || '';
    reservation.paymentExternalId = externalId;
    reservation.paymentExpectedAmount = amount;
    reservation.paymentUrl = paymentLink.payment_url || paymentLink.checkout_url || '';
    reservation.paymentQrString = paymentLink.qr_string || '';
    reservation.paymentExpiresAt = expiryDate;
    await reservation.save();
    emitCourtEvent(req, 'reservation:updated', { action: 'awaiting_payment', reservationId: reservation._id, status: reservation.status });
    emitCourtEvent(req, 'analytics:refresh', { source: 'reservations' });
    res.json(reservation);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/reservations/:id/cancel-payment
 * Admin cancels a waiting payment reservation.
 */
router.post('/:id/cancel-payment', async (req, res) => {
  try {
    const existing = await Reservation.findOne({ _id: req.params.id, courtId: req.courtId });
    if (!existing) return res.status(404).json({ error: 'Reservation not found.' });
    if (!['pending_admin', 'approved_waiting_payment'].includes(existing.status)) {
      return res.status(409).json({ error: `Cannot cancel payment from status "${existing.status}".` });
    }
    transitionReservationPayment(existing, 'cancelled', 'cancelled');
    const reservation = await Reservation.findOneAndUpdate(
      { _id: req.params.id, courtId: req.courtId },
      { status: existing.status, paymentStatus: existing.paymentStatus, $unset: { bookingSlots: 1 } },
      { new: true }
    );
    if (!reservation) return res.status(404).json({ error: 'Reservation not found.' });
    emitCourtEvent(req, 'reservation:updated', { action: 'cancelled', reservationId: reservation._id, status: reservation.status });
    emitCourtEvent(req, 'analytics:refresh', { source: 'reservations' });
    res.json(reservation);
  } catch (err) {
    if (String(err.message || '').includes('Invalid reservation status transition') ||
        String(err.message || '').includes('Invalid payment status transition')) {
      return res.status(409).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/reservations/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Reservation.findOneAndDelete({
      _id: req.params.id,
      courtId: req.courtId,
    });
    if (!deleted) return res.status(404).json({ error: 'Reservation not found.' });
    emitCourtEvent(req, 'reservation:updated', { action: 'deleted', reservationId: req.params.id });
    emitCourtEvent(req, 'analytics:refresh', { source: 'reservations' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;