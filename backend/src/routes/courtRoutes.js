import express from 'express';
import Court from '../models/Court.js';
import { resolveCapabilities } from '../lib/moduleEntitlements.js';
import { createPaymentLink } from '../lib/payments/index.js';
import { TIER_DETAILS, TIER_ORDER, TIERS } from '../lib/moduleEntitlements.js';

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

// GET /api/court/me/capabilities
router.get('/me/capabilities', async (req, res) => {
  if (!req.court) return res.status(401).json({ error: 'Missing court context.' });
  const capabilities = resolveCapabilities(req.court);
  res.json({ ...capabilities, tierDetails: TIER_DETAILS[capabilities.tier] });
});

router.post('/me/subscription/upgrade', async (req, res) => {
  try {
    const { tier } = req.body;
    if (!Object.values(TIERS).includes(tier)) return res.status(400).json({ error: 'Invalid subscription tier.' });

    const court = await Court.findById(req.courtId).lean();
    if (!court) return res.status(404).json({ error: 'Court not found.' });
    const currentTier = court.subscription.tier || TIERS.BASIC;
    if (currentTier === tier) return res.status(400).json({ error: 'This court is already on that tier.' });
    if (TIER_ORDER.indexOf(tier) <= TIER_ORDER.indexOf(currentTier)) {
      return res.status(400).json({ error: 'Use the scheduled downgrade flow for a lower tier.' });
    }
    if (court.subscription.status === 'expired' || court.subscription.status === 'suspended') {
      return res.status(403).json({ error: 'Only active or trial subscriptions can be upgraded.' });
    }

    const target = TIER_DETAILS[tier];
    if (!target.price) return res.status(400).json({ error: 'This tier requires a tailored quote. Please contact support.' });

    const expiryDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const payment = await createPaymentLink({
      amount: target.price,
      description: `${target.label} subscription for ${court.name}`,
      referenceId: `SUB-${court._id}-${Date.now()}`,
      payerEmail: court.adminEmail,
      successUrl: `${process.env.APP_BASE_URL || 'http://localhost:3000'}/admin/settings?upgrade=success`,
      failureUrl: `${process.env.APP_BASE_URL || 'http://localhost:3000'}/admin/settings?upgrade=failed`,
      expiryDate,
      metadata: { type: 'subscription', courtId: String(court._id), tier },
    });

    res.json({ tier, paymentUrl: payment.payment_url || payment.checkout_url || '', paymentId: payment.id || payment.payment_id || '' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/me/subscription/downgrade', async (req, res) => {
  try {
    const { tier, confirmation } = req.body;
    if (!Object.values(TIERS).includes(tier)) return res.status(400).json({ error: 'Invalid subscription tier.' });
    if (confirmation !== TIER_DETAILS[tier].label) return res.status(400).json({ error: `Type ${TIER_DETAILS[tier].label} to confirm this downgrade.` });

    const court = await Court.findById(req.courtId).lean();
    if (!court) return res.status(404).json({ error: 'Court not found.' });
    const currentTier = court.subscription.tier || TIERS.BASIC;
    if (TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(currentTier)) {
      return res.status(400).json({ error: 'Downgrade must target a lower tier.' });
    }

    const effectiveAt = court.subscription.status === 'trial'
      ? new Date(court.subscription.trialEnds)
      : new Date(court.subscription.nextBilling || Date.now() + 30 * 24 * 60 * 60 * 1000);
    const updated = await Court.findByIdAndUpdate(
      req.courtId,
      { $set: { 'subscription.pendingTier': tier, 'subscription.pendingTierEffectiveAt': effectiveAt } },
      { new: true, runValidators: true },
    ).lean();
    res.json({
      tier: currentTier,
      pendingTier: tier,
      pendingTierEffectiveAt: effectiveAt,
      message: `Your ${TIER_DETAILS[tier].label} tier will begin on ${effectiveAt.toISOString()}.`,
      subscription: updated.subscription,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
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