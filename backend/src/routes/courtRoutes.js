import express from 'express';
import crypto from 'node:crypto';
import Court from '../models/Court.js';
import { resolveCapabilities } from '../lib/moduleEntitlements.js';
import { createPaymentLink } from '../lib/payments/index.js';
import { TIER_DETAILS, TIER_ORDER, TIERS } from '../lib/moduleEntitlements.js';
import {
  configureManagedAccountInvoiceWebhook,
  createManagedAccount,
  getManagedAccount,
  isValidXenditWebhookUrl,
  listManagedAccountsByEmail,
} from '../services/xenditService.js';
import { tenantCourtResponse } from '../lib/courtResponse.js';

const router = express.Router();

const XENDIT_ACCOUNT_SELECT =
  'name adminEmail registrationStatus xendit.status xendit.webhookConfigured xendit.setupInProgress xendit.webhookSetupInProgress +xendit.subAccountId';

function callbackTokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function readCourtForXenditSetup(req, res) {
  if (!req.courtId) {
    res.status(401).json({ error: 'Missing court context.' });
    return null;
  }
  if (req.userRole !== 'admin') {
    res.status(403).json({ error: 'Court admin access required.' });
    return null;
  }
  const court = await Court.findById(req.courtId).select(XENDIT_ACCOUNT_SELECT).lean();
  if (!court) {
    res.status(404).json({ error: 'Court not found.' });
    return null;
  }
  if (court.registrationStatus !== 'approved') {
    res.status(403).json({ error: 'Xendit setup is available after court approval.' });
    return null;
  }
  return court;
}

async function linkManagedAccount(courtId, account) {
  return Court.findOneAndUpdate(
    {
      _id: courtId,
      registrationStatus: 'approved',
      'xendit.subAccountId': { $exists: false },
    },
    {
      $set: {
        'xendit.subAccountId': account.id,
        'xendit.status': account.status,
        'xendit.statusCheckedAt': new Date(),
        'xendit.setupInProgress': false,
      },
      $unset: { 'xendit.setupStartedAt': 1 },
    },
    { returnDocument: 'after', runValidators: true },
  ).select('xendit.status').lean();
}

async function recoverManagedAccount(court) {
  const account = await listManagedAccountsByEmail(court.adminEmail);
  if (!account) return null;
  return linkManagedAccount(court._id, account);
}

router.post('/me/xendit/setup', async (req, res) => {
  try {
    const court = await readCourtForXenditSetup(req, res);
    if (!court) return;
    if (court.xendit?.subAccountId) {
      return res.json({ status: court.xendit.status || '' });
    }

    if (court.xendit?.setupInProgress) {
      const recovered = await recoverManagedAccount(court);
      if (recovered) return res.json({ status: recovered.xendit?.status || '' });
      return res.status(409).json({ error: 'Xendit account setup is still being resolved. Refresh and try again.' });
    }

    const claimed = await Court.findOneAndUpdate(
      {
        _id: court._id,
        registrationStatus: 'approved',
        'xendit.subAccountId': { $exists: false },
        'xendit.setupInProgress': { $ne: true },
      },
      {
        $set: {
          'xendit.setupInProgress': true,
          'xendit.setupStartedAt': new Date(),
        },
      },
      { returnDocument: 'after' },
    ).select(XENDIT_ACCOUNT_SELECT).lean();

    if (!claimed) {
      const latest = await Court.findById(court._id).select(XENDIT_ACCOUNT_SELECT).lean();
      if (latest?.xendit?.subAccountId) {
        return res.json({ status: latest.xendit.status || '' });
      }
      if (latest?.xendit?.setupInProgress) {
        const recovered = await recoverManagedAccount(latest);
        if (recovered) return res.json({ status: recovered.xendit?.status || '' });
        return res.status(409).json({ error: 'Xendit account setup is still being resolved. Refresh and try again.' });
      }
      return res.status(409).json({ error: 'Court is not approved for Xendit setup.' });
    }

    let existingAccount;
    try {
      existingAccount = await listManagedAccountsByEmail(claimed.adminEmail);
    } catch {
      await Court.updateOne(
        { _id: claimed._id, 'xendit.setupInProgress': true },
        { $set: { 'xendit.setupInProgress': false }, $unset: { 'xendit.setupStartedAt': 1 } },
      );
      return res.status(502).json({ error: 'Could not verify whether this admin email already has a Xendit account.' });
    }
    if (existingAccount) {
      await Court.updateOne(
        { _id: claimed._id, 'xendit.setupInProgress': true },
        { $set: { 'xendit.setupInProgress': false }, $unset: { 'xendit.setupStartedAt': 1 } },
      );
      return res.status(409).json({ error: 'This admin email is already used by a Xendit Managed account.' });
    }

    let account;
    try {
      account = await createManagedAccount({
        email: claimed.adminEmail,
        businessName: claimed.name,
      });
    } catch {
      // Keep the claim so a retry can recover a created account by email if Xendit's response was lost.
      return res.status(502).json({ error: 'Could not confirm Xendit account setup. Refresh and try again.' });
    }

    try {
      const linked = await linkManagedAccount(claimed._id, account);
      if (linked) return res.status(201).json({ status: linked.xendit?.status || '' });
      const latest = await Court.findById(claimed._id).select(XENDIT_ACCOUNT_SELECT).lean();
      if (latest?.xendit?.subAccountId === account.id) {
        return res.status(201).json({ status: latest.xendit.status || '' });
      }
      await Court.updateOne(
        { _id: claimed._id, 'xendit.setupInProgress': true },
        { $set: { 'xendit.setupInProgress': false }, $unset: { 'xendit.setupStartedAt': 1 } },
      );
      return res.status(409).json({ error: 'Xendit account could not be linked to this court.' });
    } catch (error) {
      if (error?.code === 11000) {
        await Court.updateOne(
          { _id: claimed._id, 'xendit.setupInProgress': true },
          { $set: { 'xendit.setupInProgress': false }, $unset: { 'xendit.setupStartedAt': 1 } },
        );
        return res.status(409).json({ error: 'This Xendit account is already linked to another court.' });
      }
      throw error;
    }
  } catch {
    res.status(502).json({ error: 'Could not complete Xendit account setup.' });
  }
});

router.post('/me/xendit/refresh', async (req, res) => {
  try {
    const court = await readCourtForXenditSetup(req, res);
    if (!court) return;

    let account;
    if (court.xendit?.subAccountId) {
      account = await getManagedAccount(court.xendit.subAccountId);
    } else {
      account = await listManagedAccountsByEmail(court.adminEmail);
    }

    if (!account) {
      await Court.updateOne(
        { _id: court._id },
        {
          $set: {
            'xendit.status': '',
            'xendit.statusCheckedAt': new Date(),
            'xendit.webhookConfigured': false,
          },
        },
      );
      return res.json({ status: '' });
    }

    const statusUpdate = {
      'xendit.status': account.status,
      'xendit.statusCheckedAt': new Date(),
      ...(account.status !== 'REGISTERED' || !isValidXenditWebhookUrl()
        ? { 'xendit.webhookConfigured': false }
        : {}),
      ...(!court.xendit?.subAccountId ? { 'xendit.subAccountId': account.id } : {}),
    };
    await Court.updateOne({ _id: court._id }, { $set: statusUpdate });

    if (account.status !== 'REGISTERED' || !isValidXenditWebhookUrl()) {
      return res.json({ status: account.status });
    }
    if (court.xendit?.webhookConfigured) {
      return res.json({ status: account.status });
    }

    const webhookClaim = await Court.findOneAndUpdate(
      {
        _id: court._id,
        'xendit.subAccountId': account.id,
        'xendit.webhookConfigured': { $ne: true },
        'xendit.webhookSetupInProgress': { $ne: true },
      },
      { $set: { 'xendit.webhookSetupInProgress': true } },
      { returnDocument: 'after' },
    );
    if (!webhookClaim) return res.json({ status: account.status });

    try {
      const token = await configureManagedAccountInvoiceWebhook({
        subAccountId: account.id,
        url: process.env.XENDIT_WEBHOOK_URL,
      });
      await Court.updateOne(
        { _id: court._id, 'xendit.subAccountId': account.id },
        {
          $set: {
            'xendit.callbackTokenHash': callbackTokenHash(token),
            'xendit.webhookConfigured': true,
            'xendit.status': account.status,
            'xendit.statusCheckedAt': new Date(),
          },
          $unset: { 'xendit.webhookSetupInProgress': 1 },
        },
      );
    } catch {
      await Court.updateOne(
        { _id: court._id, 'xendit.subAccountId': account.id },
        {
          $set: { 'xendit.webhookConfigured': false },
          $unset: { 'xendit.webhookSetupInProgress': 1 },
        },
      );
      return res.status(502).json({ error: 'Xendit status was refreshed, but webhook setup could not be completed.' });
    }
    return res.json({ status: account.status });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: 'This Xendit account is already linked to another court.' });
    }
    return res.status(502).json({ error: 'Could not refresh Xendit account status.' });
  }
});

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
    res.status(201).json(tenantCourtResponse(saved));
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
    res.json(tenantCourtResponse(court));
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
    res.json(tenantCourtResponse(court));
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

    res.json(tenantCourtResponse(updated));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// GET /api/court/me
router.get('/me', async (req, res) => {
  if (!req.courtId) return res.status(401).json({ error: 'Missing court context.' });
  const court = await Court.findById(req.courtId).lean();
  if (!court) return res.status(404).json({ error: 'Court not found.' });
  res.json(tenantCourtResponse(court));
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
      referenceId: `SUB-${court._id}-${tier}-${Date.now()}`,
      payerEmail: court.adminEmail,
      successUrl: `${process.env.APP_BASE_URL || 'http://localhost:3000'}/admin/settings?upgrade=success`,
      failureUrl: `${process.env.APP_BASE_URL || 'http://localhost:3000'}/admin/settings?upgrade=failed`,
      expiryDate,
      metadata: { type: 'subscription', courtId: String(court._id), tier }, // kept for visibility in Xendit's own dashboard only, not read back by the webhook
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
  res.json(tenantCourtResponse(court));
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