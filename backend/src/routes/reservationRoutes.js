import express from 'express';
import Reservation from '../models/Reservation.js';

const router = express.Router();

// GET all reservations (admin — supports ?date=YYYY-MM-DD&status=pending)
router.get('/', async (req, res) => {
  try {
    const { date, status } = req.query;
    const filter = {};
    if (date) filter.date = date;
    if (status && status !== 'all') filter.status = status;
    const reservations = await Reservation.find(filter).sort({ date: 1, timeSlot: 1 });
    res.json(reservations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET availability for a date — returns booked slots (public)
// ?date=YYYY-MM-DD&court=1
router.get('/availability', async (req, res) => {
  try {
    const { date, court } = req.query;
    if (!date) return res.status(400).json({ error: 'date required' });
    const filter = { date, status: { $in: ['pending', 'confirmed'] } };
    if (court) filter.court = Number(court);
    const booked = await Reservation.find(filter).select('court timeSlot -_id');
    res.json(booked);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create reservation (public booking)
router.post('/', async (req, res) => {
  try {
    const { court, date, timeSlot } = req.body;
    const conflict = await Reservation.findOne({
      court, date, timeSlot,
      status: { $in: ['pending', 'confirmed'] },
    });
    if (conflict) return res.status(409).json({ error: 'This slot is already booked.' });
    const reservation = await Reservation.create(req.body);
    res.status(201).json(reservation);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update reservation (admin — change status, notes etc.)
router.put('/:id', async (req, res) => {
  try {
    const reservation = await Reservation.findByIdAndUpdate(
      req.params.id, req.body, { returnDocument: 'after' }
    );
    if (!reservation) return res.status(404).json({ error: 'Not found' });
    res.json(reservation);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE reservation (admin)
router.delete('/:id', async (req, res) => {
  try {
    await Reservation.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;