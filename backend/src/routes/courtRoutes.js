import express from 'express';
import Court from '../models/Court.js';

const router = express.Router();

/**
 * POST /api/court
 * Create new court for admin (onboarding)
 */
router.post('/', async (req, res) => {
  try {
    const {
      name, slug, description, sports, courtCount,
      location, contact, logoUrl,
      createdBy
    } = req.body;

    // Validate required fields
    if (!name || !slug) {
      return res.status(400).json({ error: 'Name and slug are required' });
    }

    // Check if slug exists
    const existing = await Court.findOne({ slug });
    if (existing) {
      return res.status(400).json({ error: 'Court slug already exists' });
    }

    const court = new Court({
      name,
      slug,
      description: description || '',
      sports: sports || ['badminton'],
      courtCount: Number(courtCount) || 4,
      location: location || {},
      contact: contact || {},
      logoUrl: logoUrl || '',
      createdBy: createdBy || req.user?.id,
      
      // ✅ Auto-trial subscription
      subscription: {
        status: 'trial',
        plan: 'monthly',
        amount: 0,
        trialEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
        nextBilling: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      },
      
      // ✅ Public by default
      isPublic: true,
      isActive: true,
      onboardingComplete: false
    });

    const saved = await court.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error('Create court error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/court/me/logo
 * Update logo URL after Cloudinary upload
 */
router.patch('/me/logo', async (req, res) => {
  try {
    const { logoUrl } = req.body;
    if (!logoUrl) return res.status(400).json({ error: 'logoUrl is required.' });

    const court = await Court.findByIdAndUpdate(
      req.courtId,
      { $set: { logoUrl } },
      { new: true }
    );
    if (!court) return res.status(404).json({ error: 'Court not found.' });
    res.json(court);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/court/me/photos
 * Add or remove a photo URL
 * Body: { action: 'add' | 'remove', url: string }
 */
router.patch('/me/photos', async (req, res) => {
  try {
    const { action, url } = req.body;
    if (!action || !url) return res.status(400).json({ error: 'action and url are required.' });
    if (!['add', 'remove'].includes(action)) return res.status(400).json({ error: 'action must be add or remove.' });

    const update = action === 'add'
      ? { $push: { photos: url } }
      : { $pull: { photos: url } };

    const court = await Court.findByIdAndUpdate(req.courtId, update, { new: true });
    if (!court) return res.status(404).json({ error: 'Court not found.' });
    res.json(court);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/court/me/subscription
 * Admin can upgrade from monthly to annual only
 */
router.patch('/me/subscription', async (req, res) => {
  try {
    const { plan } = req.body;

    // Admin can only upgrade to annual — not downgrade or change status
    if (plan !== 'annual') {
      return res.status(403).json({ error: 'Admins can only upgrade to annual plan. Contact support for other changes.' });
    }

    const court = await Court.findById(req.courtId).lean();
    if (!court) return res.status(404).json({ error: 'Court not found.' });

    if (court.subscription.plan === 'annual') {
      return res.status(400).json({ error: 'Already on annual plan.' });
    }

    if (court.subscription.status !== 'active') {
      return res.status(403).json({ error: 'Only active subscriptions can be upgraded.' });
    }

    const nextBilling = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    const updated = await Court.findByIdAndUpdate(
      req.courtId,
      {
        $set: {
          'subscription.plan':        'annual',
          'subscription.amount':      20000,
          'subscription.nextBilling': nextBilling,
        },
      },
      { new: true }
    );

    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// GET /api/court/me
router.get('/me', async (req, res) => {
  if (!req.courtId) return res.status(401).json({ error: 'Missing court context.' });
  const court = await Court.findById(req.courtId).lean();
  if (!court) return res.status(404).json({ error: 'Court not found.' });
  res.json(court);
});

// PATCH /api/court/me
router.patch('/me', async (req, res) => {
  if (!req.courtId) return res.status(401).json({ error: 'Missing court context.' });

  const { name, description, sports, courtCount, amenities, location, contact, settings } = req.body;
  const update = {};
  if (name        !== undefined) update.name        = name;
  if (description !== undefined) update.description = description;
  if (sports      !== undefined) update.sports      = sports;
  if (courtCount  !== undefined) update.courtCount  = courtCount;
  if (amenities   !== undefined) update.amenities   = amenities;
  if (location    !== undefined) update.location    = location;
  if (contact     !== undefined) update.contact     = contact;
  if (settings    !== undefined) update.settings    = settings;

  const court = await Court.findByIdAndUpdate(
    req.courtId,
    { $set: update },
    { new: true, runValidators: true },
  );
  if (!court) return res.status(404).json({ error: 'Court not found.' });
  res.json(court);
});

// PATCH /api/court/me/payout
router.patch('/me/payout', async (req, res) => {
  if (!req.courtId) return res.status(401).json({ error: 'Missing court context.' });
  try {
    const { recipientCode, accountName = '', channelCode = '', accountNumber = '' } = req.body;
    if (!recipientCode) return res.status(400).json({ error: 'recipientCode is required.' });
    const last4 = String(accountNumber || '').slice(-4);
    const court = await Court.findByIdAndUpdate(
      req.courtId,
      {
        $set: {
          payout: {
            recipientCode: String(recipientCode),
            accountName: String(accountName),
            channelCode: String(channelCode),
            accountNumberLast4: last4,
            isConfigured: true,
          },
        },
      },
      { new: true, runValidators: true }
    ).lean();
    if (!court) return res.status(404).json({ error: 'Court not found.' });
    res.json({
      payout: court.payout,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/court/me/payout
router.get('/me/payout', async (req, res) => {
  if (!req.courtId) return res.status(401).json({ error: 'Missing court context.' });
  try {
    const court = await Court.findById(req.courtId).lean();
    if (!court) return res.status(404).json({ error: 'Court not found.' });
    res.json({
      payout: court.payout || {
        recipientCode: '',
        accountName: '',
        channelCode: '',
        accountNumberLast4: '',
        isConfigured: false,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;