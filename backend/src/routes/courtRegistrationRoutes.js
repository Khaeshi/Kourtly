import express from 'express';
import Court from '../models/Court.js';
import User from '../models/User.js';
import { getAuthenticatedUser } from '../lib/internalAuth.js';
import { parseCourtRegistration } from '../services/courtRegistration.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const authenticatedUser = await getAuthenticatedUser(req);
    if (!authenticatedUser) {
      return res.status(401).json({ error: 'Valid sign-in required to register a court.' });
    }

    const parsed = parseCourtRegistration(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const { name, slug, sports, courtCount, location, contact, contactPerson } = parsed.value;

    const existing = await Court.findOne({ slug });
    if (existing) return res.status(409).json({ error: 'This slug is already taken.' });

    const adminEmail = authenticatedUser.email.toLowerCase();
    const court = await Court.create({
      name, slug, adminEmail, sports, courtCount, location,
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
