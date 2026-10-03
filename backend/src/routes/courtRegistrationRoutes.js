import express from 'express';
import Court from '../models/Court.js';
import User from '../models/User.js';
import { getAuthenticatedUser } from '../lib/internalAuth.js';

const router = express.Router();

function parseCoordinate(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

router.post('/', async (req, res) => {
  try {
    const authenticatedUser = await getAuthenticatedUser(req);
    if (!authenticatedUser) {
      return res.status(401).json({ error: 'Valid sign-in required to register a court.' });
    }

    const {
      name, slug,
      sports = ['badminton'], courtCount = 4,
      contact = {}, contactPerson = {},
    } = req.body;
    const location = req.body.location && typeof req.body.location === 'object'
      ? req.body.location
      : {};
    const city = typeof location.city === 'string' ? location.city.trim() : '';
    const lat = parseCoordinate(location.lat);
    const lng = parseCoordinate(location.lng);

    if (!name || !slug) {
      return res.status(400).json({ error: 'name and slug are required.' });
    }
    if (!city || lat === null || lng === null) {
      return res.status(400).json({ error: 'location.city, location.lat, and location.lng are required.' });
    }

    const existing = await Court.findOne({ slug: slug.toLowerCase() });
    if (existing) return res.status(409).json({ error: 'This slug is already taken.' });

    const adminEmail = authenticatedUser.email.toLowerCase();
    const court = await Court.create({
      name, slug, adminEmail, sports, courtCount,
      location: { ...location, city, lat, lng },
      contact, contactPerson,
      registeredBy: authenticatedUser._id,
      registrationStatus: 'pending',
      subscription: { status: 'pending', trialEnds: null },
      isPublic: false,
      isActive: true,
    });

    await User.findOneAndUpdate(
      { email: adminEmail.toLowerCase() },
      {
        $set: { courtId: court._id, role: 'admin' },
        $setOnInsert: { provider: 'google', name: '' },
      },
      { upsert: true, new: true }
    );

    res.status(201).json({
      success: true,
      courtId: court._id,
      slug: court.slug,
      message: 'Court registered and is pending approval.',
    });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Slug already taken.' });
    res.status(400).json({ error: err.message });
  }
});

export default router;
