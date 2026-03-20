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
 * Returns paid reservation tabs, latest first.
 */
router.get('/history', async (req, res) => {
  try {
    const tabs = await ReservationTab.find({ status: 'paid' })
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();
    res.json(tabs);
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

    const tab = await ReservationTab.findByIdAndUpdate(
      req.params.id,
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
    const tab = await ReservationTab.findById(req.params.id);
    if (!tab) return res.status(404).json({ error: 'Tab not found' });

    const idx     = Number(req.params.itemIndex);
    const removed = tab.items[idx];
    if (!removed) return res.status(404).json({ error: 'Item not found' });

    await ReservationTab.findByIdAndUpdate(req.params.id, { $unset: { [`items.${idx}`]: 1 } });
    const updated = await ReservationTab.findByIdAndUpdate(
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
 * PUT /api/reservation-tabs/:id/pay
 * Mark a reservation tab as paid AND mark the linked reservation as completed.
 */
router.put('/:id/pay', async (req, res) => {
  try {
    const tab = await ReservationTab.findByIdAndUpdate(
      req.params.id,
      { status: 'paid' },
      { new: true }
    );
    if (!tab) return res.status(404).json({ error: 'Tab not found' });

    // Auto-complete the reservation — payment means the session is done
    if (tab.reservation) {
      await Reservation.findByIdAndUpdate(
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
    const tab = await ReservationTab.findByIdAndUpdate(
      req.params.id,
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