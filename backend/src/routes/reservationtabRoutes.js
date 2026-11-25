import express from 'express';
import mongoose from 'mongoose';
import ReservationTab from '../models/ReservationTab.js';
import Reservation    from '../models/Reservation.js';
import { emitCourtEvent } from '../lib/emitCourtEvent.js';
import { assertReservationTransition } from '../lib/reservationStateMachine.js';
import {
  emitBillingStockUpdates,
  recordBillingStockMovement,
} from '../services/billingStock.js';

const router = express.Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Ensure a ReservationTab exists for a reservation.
 * Creates one if missing, returns existing if already there.
 */
async function ensureTab(reservation) {
  const existing = await ReservationTab.findOne({ reservation: reservation._id });
  if (existing) return existing;

  const hasOnlinePaymentData =
    reservation.amountPaidOnline !== undefined &&
    reservation.amountPaidOnline !== null &&
    Number(reservation.amountPaidOnline) > 0;
  const reservationFee = Number(reservation.reservationFeeAmount || 0);
  const maintenanceFee = Number(reservation.maintenanceFeeAmount || 0);
  const paidOnline = hasOnlinePaymentData ? Number(reservation.amountPaidOnline || 0) : 0;
  const paidCourtFee = Math.min(reservationFee, Math.max(0, paidOnline - maintenanceFee));
  const remainingBalance = hasOnlinePaymentData
    ? Math.max(0, reservationFee - paidCourtFee)
    : 0;

  return ReservationTab.create({
    courtId: reservation.courtId, 
    reservation: reservation._id,
    guestName:   reservation.name,
    court:       reservation.court,
    date:        reservation.date,
    timeSlot:    reservation.timeSlot,
    duration:    reservation.duration ?? 1,
    items:       [],
    total:       remainingBalance,
    status:      'open',
    paymentSummary: {
      reservationFee,
      paidOnline,
      paidCourtFee,
      remainingBalance,
      source: 'xendit',
    },
  });
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/reservation-tabs/today
 * Returns open reservation tabs for today's confirmed reservations.
 * Auto-creates tabs for any confirmed reservation that doesn't have one yet.
 */
router.get('/today', async (req, res) => {
  try {
    const today = todayStr();
    const open = await ReservationTab.find({ courtId: req.courtId, date: today, status: 'open' })
      .sort({ timeSlot: 1 }).lean();
    res.json(open);
  } catch (err) {
    if (String(err.message || '').includes('Invalid reservation status transition')) {
      return res.status(409).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

router.post('/from-reservation/:reservationId', async (req, res) => {
  try {
    const reservation = await Reservation.findOne({ _id: req.params.reservationId, courtId: req.courtId }).lean();
    if (!reservation) return res.status(404).json({ error: 'Reservation not found.' });
    if (!['confirmed', 'completed'].includes(reservation.status)) {
      return res.status(409).json({ error: 'Only confirmed reservations can create a billing tab.' });
    }
    const tab = await ensureTab(reservation);
    emitCourtEvent(req, 'billing:tab_updated', { action: 'reservation_tab_created', tabId: tab._id, reservationId: reservation._id });
    res.status(201).json(tab);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/reservation-tabs/history
 * Returns paid+unpaid reservation tabs with pagination + date filter.
 * ?status=paid|unpaid|all  &date=YYYY-MM-DD  &page=1  &limit=20
 */
router.get('/history', async (req, res) => {
  try {
    const { status = 'all', date, page = '1', limit = '20' } = req.query;
    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit));
    const skip     = (pageNum - 1) * limitNum;

    const query = { courtId: req.courtId };
    if (status === 'paid')        query.status = 'paid';
    else if (status === 'unpaid') query.status = 'unpaid';
    else if (status === 'open'  ) query.status = 'open';
    else                          query.status = { $in: ['open', 'paid', 'unpaid'] };

    if (date) query.date = date; // reservation date string YYYY-MM-DD

    const [tabs, total] = await Promise.all([
      ReservationTab.find(query).sort({ updatedAt: -1 }).skip(skip).limit(limitNum).lean(),
      ReservationTab.countDocuments(query),
    ]);

    res.json({
      tabs,
      pagination: {
        page: pageNum, limit: limitNum, total,
        totalPages: Math.ceil(total / limitNum),
        hasNext:    pageNum < Math.ceil(total / limitNum),
        hasPrev:    pageNum > 1,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/reservation-tabs/:id/items
 * Add an item to a reservation tab.
 */
router.post('/:id/items', async (req, res) => {
  const session = await mongoose.startSession();
  const stockChanges = [];
  let tab;
  try {
    const { itemId, name, price, quantity = 1, idempotencyKey } = req.body;
    if (idempotencyKey) {
      const replay = await ReservationTab.findOne({
        _id: req.params.id, courtId: req.courtId, 'items.idempotencyKey': idempotencyKey,
      });
      if (replay) return res.json(replay);
    }
    const lineTotal = price * quantity;

    await session.withTransaction(async () => {
      stockChanges.length = 0;
      tab = await ReservationTab.findOne({
        _id: req.params.id, courtId: req.courtId,
      }).session(session);
      if (!tab) {
        const error = new Error('Tab not found');
        error.status = 404;
        throw error;
      }

      tab.items.push({ item: itemId, name, price, quantity, idempotencyKey: idempotencyKey || null, addedAt: new Date() });
      tab.total += lineTotal;
      const line = tab.items[tab.items.length - 1];
      await tab.save({ session });
      const change = await recordBillingStockMovement({
        req, session, itemId, type: 'sale', quantity, unitPrice: price,
        note: 'Reservation tab charge', tabType: 'reservation',
        tabId: tab._id, tabLineId: line._id,
      });
      if (change) stockChanges.push(change);
    });

    tab = await ReservationTab.findOne({ _id: req.params.id, courtId: req.courtId });
    emitCourtEvent(req, 'billing:tab_updated', { action: 'reservation_item_added', tabId: tab._id });
    await emitBillingStockUpdates(req, stockChanges);
    res.json(tab);
  } catch (err) {
    res.status(err.status ?? 400).json({ error: err.message });
  } finally {
    await session.endSession();
  }
});

/**
 * DELETE /api/reservation-tabs/:id/items/:itemIndex
 * Remove an item from a reservation tab by index.
 */
router.delete('/:id/items/:itemIndex', async (req, res) => {
  const session = await mongoose.startSession();
  const stockChanges = [];
  let removed;
  try {
    await session.withTransaction(async () => {
      stockChanges.length = 0;
      const tab = await ReservationTab.findOne({
        _id: req.params.id, courtId: req.courtId,
      }).session(session);
      if (!tab) {
        const error = new Error('Tab not found');
        error.status = 404;
        throw error;
      }
      const idx = Number(req.params.itemIndex);
      removed = tab.items[idx];
      if (!removed) {
        const error = new Error('Item not found');
        error.status = 404;
        throw error;
      }
      tab.items.splice(idx, 1);
      tab.total -= removed.price * removed.quantity;
      await tab.save({ session });
      const change = await recordBillingStockMovement({
        req, session, itemId: removed.item, type: 'void',
        quantity: removed.quantity, unitPrice: removed.price,
        note: 'Reservation tab line removed', tabType: 'reservation',
        tabId: tab._id, tabLineId: removed._id,
      });
      if (change) stockChanges.push(change);
    });

    const updated = await ReservationTab.findOne({
      _id: req.params.id, courtId: req.courtId,
    });
    emitCourtEvent(req, 'billing:tab_updated', {
      action: 'reservation_item_removed', tabId: updated?._id,
    });
    await emitBillingStockUpdates(req, stockChanges);
    res.json(updated);
  } catch (err) {
    res.status(err.status ?? 400).json({ error: err.message });
  } finally {
    await session.endSession();
  }
});

/**
 * PUT /api/reservation-tabs/:id/unpaid
 * Mark a reservation tab as unpaid (debt — keeps record).
 */
router.put('/:id/unpaid', async (req, res) => {
  try {
    const tab = await ReservationTab.findOneAndUpdate(
      {_id: req.params.id, courtId: req.courtId}, 
      { status: 'unpaid' }, { new: true }
    );
    if (!tab) return res.status(404).json({ error: 'Tab not found' });
    emitCourtEvent(req, 'billing:tab_paid', { action: 'reservation_marked_unpaid', tabId: tab._id });
    emitCourtEvent(req, 'analytics:refresh', { source: 'reservation_tabs' });
    res.json(tab);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/reservation-tabs/:id/pay-unpaid
 * Mark a previously-unpaid reservation tab as paid.
 */
router.put('/:id/pay-unpaid', async (req, res) => {
  try {
    const tab = await ReservationTab.findOneAndUpdate(
      {_id: req.params.id, courtId: req.courtId}, 
      { status: 'paid' }, { new: true }
    );
    if (!tab) return res.status(404).json({ error: 'Tab not found' });
    emitCourtEvent(req, 'billing:tab_paid', { action: 'reservation_unpaid_collected', tabId: tab._id });
    emitCourtEvent(req, 'analytics:refresh', { source: 'reservation_tabs' });
    res.json(tab);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/reservation-tabs/:id/pay
 * Mark a reservation tab as paid AND mark the linked reservation as completed.
 *//**
 * PUT /api/reservation-tabs/:id/pay
 * Mark a reservation tab as paid AND mark the linked reservation as completed.
 */
router.put('/:id/pay', async (req, res) => {
  try {
    const tab = await ReservationTab.findOneAndUpdate(
      {_id: req.params.id, courtId: req.courtId},
      { status: 'paid', 'paymentSummary.remainingBalance': 0 },
      { new: true }
    );
    if (!tab) return res.status(404).json({ error: 'Tab not found' });

    // Auto-complete the reservation — payment means the session is done
    if (tab.reservation) {
      const linkedReservation = await Reservation.findById(tab.reservation).select('status').lean();
      if (linkedReservation?.status) {
        assertReservationTransition(linkedReservation.status, 'completed');
      }
      await Reservation.findOneAndUpdate(
        tab.reservation,
        { status: 'completed' },
        { new: true });
      }

      emitCourtEvent(req, 'billing:tab_paid', { action: 'reservation_paid', tabId: tab._id });
      emitCourtEvent(req, 'reservation:updated', { action: 'completed_from_tab', reservationId: tab.reservation });
      emitCourtEvent(req, 'analytics:refresh', { source: 'reservation_tabs' });
      res.json(tab);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
});

/**
 * PUT /api/reservation-tabs/:id/collect-balance
 * Explicitly collect remaining reservation balance at counter.
 */
router.put('/:id/collect-balance', async (req, res) => {
  try {
    const tab = await ReservationTab.findOneAndUpdate(
      { _id: req.params.id, courtId: req.courtId },
      { status: 'paid', total: 0, 'paymentSummary.remainingBalance': 0 },
      { new: true }
    );
    if (!tab) return res.status(404).json({ error: 'Tab not found' });
    emitCourtEvent(req, 'billing:tab_paid', { action: 'reservation_balance_collected', tabId: tab._id });
    emitCourtEvent(req, 'analytics:refresh', { source: 'reservation_tabs' });
    res.json(tab);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/reservation-tabs/:id
 * Discard a reservation tab (clears items, keeps record).
 */
router.delete('/:id', async (req, res) => {
  const session = await mongoose.startSession();
  const stockChanges = [];
  try {
    let tab;
    await session.withTransaction(async () => {
      stockChanges.length = 0;
      tab = await ReservationTab.findOne({
        _id: req.params.id, courtId: req.courtId,
      }).session(session);
      if (!tab) return;
      for (const line of tab.items) {
        const change = await recordBillingStockMovement({
          req, session, itemId: line.item, type: 'void',
          quantity: line.quantity, unitPrice: line.price,
          note: 'Reservation tab cleared', tabType: 'reservation',
          tabId: tab._id, tabLineId: line._id,
        });
        if (change) stockChanges.push(change);
      }
      tab.items = [];
      tab.total = 0;
      await tab.save({ session });
    });
    if (!tab) return res.status(404).json({ error: 'Tab not found' });
    emitCourtEvent(req, 'billing:tab_updated', { action: 'reservation_tab_cleared', tabId: tab._id });
    await emitBillingStockUpdates(req, stockChanges);
    res.json({ success: true });
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message });
  } finally {
    await session.endSession();
  }
});

export default router;