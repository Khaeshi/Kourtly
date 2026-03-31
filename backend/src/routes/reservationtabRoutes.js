import express from 'express';
import ReservationTab from '../models/ReservationTab.js';
import Reservation    from '../models/Reservation.js';

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

  return ReservationTab.create({
    courtId: reservation.courtId, 
    reservation: reservation._id,
    guestName:   reservation.name,
    court:       reservation.court,
    date:        reservation.date,
    timeSlot:    reservation.timeSlot,
    duration:    reservation.duration ?? 1,
    items:       [],
    total:       0,
    status:      'open',
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

    // Find all confirmed reservations for today
    const confirmed = await Reservation.find({
      courtId: req.courtId,
      date:   today,
      status: 'confirmed',
    }).lean();

    // Ensure a tab exists for each
    const tabs = await Promise.all(confirmed.map(r => ensureTab(r)));

    // Return only open tabs (not paid ones)
    const open = tabs.filter(t => t.status === 'open');
    res.json(open);
  } catch (err) {
    res.status(500).json({ error: err.message });
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
    else                          query.status = { $in: ['paid', 'unpaid'] };

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
  try {
    const { itemId, name, price, quantity = 1 } = req.body;
    const lineTotal = price * quantity;

    const tab = await ReservationTab.findOneAndUpdate(
      {_id: req.params.id, courtId: req.courtId },
      {
        $push: { items: { item: itemId, name, price, quantity, addedAt: new Date() } },
        $inc:  { total: lineTotal },
      },
      { new: true }
    );

    if (!tab) return res.status(404).json({ error: 'Tab not found' });
    res.json(tab);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /api/reservation-tabs/:id/items/:itemIndex
 * Remove an item from a reservation tab by index.
 */
router.delete('/:id/items/:itemIndex', async (req, res) => {
  try {
    const tab = await ReservationTab.findById({_id: req.params.id, courtId: req.courtId});
    if (!tab) return res.status(404).json({ error: 'Tab not found' });

    const idx     = Number(req.params.itemIndex);
    const removed = tab.items[idx];
    if (!removed) return res.status(404).json({ error: 'Item not found' });

    await ReservationTab.findOneAndUpdate(req.params.id, { $unset: { [`items.${idx}`]: 1 } });
    const updated = await ReservationTab.findOneAndUpdate(
      req.params.id,
      { $pull: { items: null }, $inc: { total: -(removed.price * removed.quantity) } },
      { new: true }
    );

    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
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
      { status: 'paid' },
      { new: true }
    );
    if (!tab) return res.status(404).json({ error: 'Tab not found' });

    // Auto-complete the reservation — payment means the session is done
    if (tab.reservation) {
      await Reservation.findOneAndUpdate(
        tab.reservation,
        { status: 'completed' },
        { new: true }
      );
    }

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
  try {
    const tab = await ReservationTab.findOneAndUpdate(
      {_id: req.params.id, courtId: req.courtId},
      { items: [], total: 0 },
      { new: true }
    );
    if (!tab) return res.status(404).json({ error: 'Tab not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;