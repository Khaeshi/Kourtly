import express from 'express';
import Court from '../models/Court.js';
import User  from '../models/User.js';
import PayoutTransfer from '../models/PayoutTransfer.js';
import TierPricing from '../models/TierPricing.js';
import { MODULES, MODULE_LABELS, resolveCapabilities, TIER_DETAILS, TIERS } from '../lib/moduleEntitlements.js';
import { getAuthenticatedUser } from '../lib/internalAuth.js';
import { superadminCourtResponse } from '../lib/courtResponse.js';

const router = express.Router();

async function requireSuperAdmin(req, res, next) {
  req.user = await getAuthenticatedUser(req);
  req.userRole = req.user?.role;
  if (req.userRole !== 'superadmin') {
    return res.status(403).json({ error: 'Superadmin access required.' });
  }
  next();
}

function hasOnlyBodyKeys(body, allowedKeys) {
  return Boolean(
    body
    && typeof body === 'object'
    && !Array.isArray(body)
    && Object.keys(body).every(key => allowedKeys.includes(key))
  );
}

function isValidAmount(amount) {
  return typeof amount === 'number' && Number.isInteger(amount) && amount > 0 && amount <= 10000;
}

function parseNextBilling(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.exec(value);
  if (!dateParts) return null;
  const [, year, month, day] = dateParts;
  const calendarDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    calendarDate.getUTCFullYear() !== Number(year)
    || calendarDate.getUTCMonth() !== Number(month) - 1
    || calendarDate.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

router.use(requireSuperAdmin);

router.get('/tier-pricing', async (_req, res) => {
  try {
    const pricing = await TierPricing.find().sort({ tier: 1 }).lean();
    res.json(pricing);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/tier-pricing/:tier', async (req, res) => {
  try {
    if (!Object.values(TIERS).includes(req.params.tier)) {
      return res.status(400).json({ error: 'Invalid subscription tier.' });
    }
    if (!hasOnlyBodyKeys(req.body, ['price', 'active'])) {
      return res.status(400).json({ error: 'Only price and active may be provided.' });
    }
    const { price, active } = req.body;
    if (typeof price !== 'number' || !Number.isInteger(price) || price < 1 || price > 10000) {
      return res.status(400).json({ error: 'price must be a positive integer no greater than 10000.' });
    }
    if (active !== undefined && typeof active !== 'boolean') {
      return res.status(400).json({ error: 'active must be a boolean.' });
    }

    const pricing = await TierPricing.findOne({ tier: req.params.tier });
    const now = new Date();
    const changedBy = req.user?._id ?? null;
    const history = pricing?.history ?? [];
    if (!pricing) {
      const created = await TierPricing.create({
        tier: req.params.tier,
        price,
        active: active ?? true,
        updatedBy: changedBy,
        updatedAt: now,
        history: [{ price, changedBy, changedAt: now }],
      });
      return res.json(created);
    }

    if (pricing.price !== price) {
      pricing.history = [...history, { price, changedBy, changedAt: now }].slice(-20);
    }
    pricing.price = price;
    if (active !== undefined) pricing.active = active;
    pricing.updatedBy = changedBy;
    pricing.updatedAt = now;
    await pricing.save();
    res.json(pricing);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Tier pricing already exists.' });
    res.status(400).json({ error: err.message });
  }
});

router.get('/courts', async (req, res) => {
  try {
    const courts = await Court.find().select('+xendit.subAccountId').sort({ createdAt: -1 }).lean();
    res.json(courts.map(court => ({
      ...superadminCourtResponse(court),
      capabilities: resolveCapabilities(court),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/courts/pending', async (req, res) => {
  try {
    const courts = await Court.find({ registrationStatus: 'pending' })
      .select('+xendit.subAccountId')
      .populate('registeredBy', 'email')
      .sort({ createdAt: -1 })
      .lean();
    res.json(courts.map(superadminCourtResponse));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/courts/:id/approve', async (req, res) => {
  try {
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const court = await Court.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          registrationStatus: 'approved',
          'subscription.status': 'trial',
          'subscription.trialEnds': trialEndsAt,
          trialEndsAt,
        },
      },
      { new: true, runValidators: true },
    ).select('+xendit.subAccountId');
    if (!court) return res.status(404).json({ error: 'Court not found.' });
    res.json(superadminCourtResponse(court));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/courts/:id/reject', async (req, res) => {
  try {
    const court = await Court.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          registrationStatus: 'rejected',
          rejectionReason: req.body.reason ?? '',
        },
      },
      { new: true, runValidators: true },
    ).select('+xendit.subAccountId');
    if (!court) return res.status(404).json({ error: 'Court not found.' });
    res.json(superadminCourtResponse(court));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/courts/:id/entitlements', async (req, res) => {
  try {
    const court = await Court.findById(req.params.id).select('name subscription').lean();
    if (!court) return res.status(404).json({ error: 'Court not found.' });
    res.json({
      courtId: court._id,
      tier: resolveCapabilities(court).tier,
      modules: resolveCapabilities(court).modules,
      tierDetails: TIER_DETAILS[resolveCapabilities(court).tier],
      availableModules: Object.entries(MODULE_LABELS).map(([key, label]) => ({ key, label })),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/courts/:id/entitlements', async (req, res) => {
  try {
    const { tier, overrides = [] } = req.body;
    if (tier && !Object.values(TIERS).includes(tier)) {
      return res.status(400).json({ error: 'Invalid subscription tier.' });
    }
    if (!Array.isArray(overrides)) {
      return res.status(400).json({ error: 'overrides must be an array.' });
    }
    const validOverrides = overrides.map(override => ({
      key: override.key,
      enabled: Boolean(override.enabled),
      source: 'override',
      expiresAt: override.expiresAt || null,
    }));
    if (validOverrides.some(override => !Object.values(MODULES).includes(override.key))) {
      return res.status(400).json({ error: 'Invalid module key.' });
    }

    let updatedTierPricing = null;
    if (tier) {
      const currentCourt = await Court.findById(req.params.id).select('subscription.tier').lean();
      if (!currentCourt) return res.status(404).json({ error: 'Court not found.' });
      if (currentCourt.subscription.tier !== tier) {
        updatedTierPricing = await TierPricing.findOne({ tier, active: true }).lean();
        if (!updatedTierPricing) {
          return res.status(409).json({ error: 'This tier is not currently available.' });
        }
      }
    }

    const update = {
      'subscription.modules': validOverrides,
      'subscription.pendingTier': null,
      'subscription.pendingTierEffectiveAt': null,
    };
    if (tier) update['subscription.tier'] = tier;
    if (updatedTierPricing) {
      update['subscription.amount'] = updatedTierPricing.price;
      update['subscription.isCustomPrice'] = false;
    }
    const court = await Court.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true },
    ).select('+xendit.subAccountId').lean();
    if (!court) return res.status(404).json({ error: 'Court not found.' });
    res.json({
      ...superadminCourtResponse(court),
      capabilities: resolveCapabilities(court),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const courts = await Court.find().lean();
    const active    = courts.filter(c => c.subscription.status === 'active');
    const trials    = courts.filter(c => c.subscription.status === 'trial');
    const expired   = courts.filter(c => c.subscription.status === 'expired');
    const suspended = courts.filter(c => c.subscription.status === 'suspended');
    const mrr = active.reduce((sum, c) => {
      const amount = c.subscription.amount ?? 0;
      return sum + (c.subscription.plan === 'annual' ? Math.round(amount / 12) : amount);
    }, 0);
    res.json({
      total: courts.length, active: active.length,
      trials: trials.length, expired: expired.length,
      suspended: suspended.length, mrr,
      arr: mrr * 12,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/courts/:id/subscription', async (req, res) => {
  try {
    const { status, plan, extendTrialDays, amount, nextBilling, isCustomPrice } = req.body;
    if (plan !== undefined && plan !== 'monthly' && plan !== 'annual') {
      return res.status(400).json({ error: 'Invalid subscription plan.' });
    }
    if (amount !== undefined && !isValidAmount(amount)) {
      return res.status(400).json({ error: 'amount must be a positive integer no greater than 10000.' });
    }
    if (isCustomPrice !== undefined && typeof isCustomPrice !== 'boolean') {
      return res.status(400).json({ error: 'isCustomPrice must be a boolean.' });
    }
    if (amount !== undefined && isCustomPrice === false) {
      return res.status(400).json({ error: 'A manual amount must be marked as a custom price.' });
    }
    const parsedNextBilling = nextBilling === undefined ? undefined : parseNextBilling(nextBilling);
    if (nextBilling !== undefined && !parsedNextBilling) {
      return res.status(400).json({ error: 'nextBilling must be a valid date.' });
    }

    const existingCourt = await Court.findById(req.params.id).select('subscription').lean();
    if (!existingCourt) return res.status(404).json({ error: 'Court not found.' });
    const legacyAnnualReactivation = status === 'active'
      && plan === 'annual'
      && existingCourt.subscription.plan === 'annual';
    if (plan === 'annual' && !legacyAnnualReactivation) {
      return res.status(400).json({ error: 'Annual plans are no longer available for new subscriptions.' });
    }

    const update = {};
    if (status) update['subscription.status'] = status;
    if (plan === 'monthly') update['subscription.plan'] = plan;
    if (amount !== undefined) {
      update['subscription.amount'] = amount;
      update['subscription.isCustomPrice'] = true;
    }
    if (isCustomPrice === true) {
      const currentAmount = amount ?? existingCourt.subscription.amount;
      if (!isValidAmount(currentAmount)) {
        return res.status(400).json({ error: 'A custom price requires a positive integer amount no greater than 10000.' });
      }
      update['subscription.isCustomPrice'] = true;
    } else if (isCustomPrice === false) {
      const pricing = await TierPricing.findOne({
        tier: existingCourt.subscription.tier,
        active: true,
      }).lean();
      if (!pricing) return res.status(409).json({ error: 'The current tier has no active price.' });
      update['subscription.amount'] = pricing.price;
      update['subscription.isCustomPrice'] = false;
    }
    if (parsedNextBilling) update['subscription.nextBilling'] = parsedNextBilling;
    if (status === 'active') {
      const now = new Date();
      update['subscription.startDate'] = now;
      if (!parsedNextBilling) {
        const billingPlan = plan === 'monthly' ? 'monthly' : existingCourt.subscription.plan;
        update['subscription.nextBilling'] = new Date(
          now.getTime() + (billingPlan === 'annual' ? 365 : 30) * 24 * 60 * 60 * 1000
        );
      }
      update['isPublic'] = true;
    }
    if (extendTrialDays) {
      const base  = new Date(existingCourt.subscription.trialEnds) > new Date()
        ? new Date(existingCourt.subscription.trialEnds) : new Date();
      base.setDate(base.getDate() + Number(extendTrialDays));
      update['subscription.trialEnds'] = base;
    }
    const court = await Court.findByIdAndUpdate(
      req.params.id, { $set: update }, { new: true, runValidators: true }
    ).select('+xendit.subAccountId');
    if (!court) return res.status(404).json({ error: 'Court not found.' });
    res.json(superadminCourtResponse(court));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/courts', async (req, res) => {
  try {
    const { name, slug, adminEmail, sports = ['badminton'], courtCount = 4 } = req.body;
    if (!name || !slug || !adminEmail) {
      return res.status(400).json({ error: 'name, slug, and adminEmail are required.' });
    }
    const court = await Court.create({
      name, slug, adminEmail, sports, courtCount,
      registrationStatus: 'approved',
      subscription: { status: 'trial' },
      isPublic: false, isActive: true,
    });
    await User.findOneAndUpdate(
      { email: adminEmail.toLowerCase() },
      {
        $set:         { courtId: court._id, role: 'admin' },
        $setOnInsert: { provider: 'google', name: '' },
      },
      { upsert: true, new: true }
    );
    res.status(201).json(superadminCourtResponse(court));
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Slug already exists.' });
    res.status(400).json({ error: err.message });
  }
});

/**
 *  PATCH /api/superadmin/courts/:_id
 * @desc Update court admin email - reassigns the admin user
 */
router.patch('/courts/:id', async (req, res) => {
  try {
    const { adminEmail } = req.body;
    if (!adminEmail) return res.status(400).json({ error: 'adminEmail is required.' });

    const court = await Court.findById(req.params.id).select('+xendit.subAccountId');
    if (!court) return res.status(404).json({ error: 'Court not found.' });

    const oldEmail = court.adminEmail;

    // Update court
    court.adminEmail = adminEmail.toLowerCase().trim();
    await court.save();

    // Remove courtId from old admin (if exists and isn't superadmin)
    await User.findOneAndUpdate(
      { email: oldEmail, role: 'admin' },
      { $unset: { courtId: '' }, role: 'user' }
    );

    // Assign courtId to new admin (upsert in case they haven't signed in yet)
    await User.findOneAndUpdate(
      { email: adminEmail.toLowerCase() },
      {
        $set:         { courtId: court._id, role: 'admin' },
        $setOnInsert: { provider: 'google', name: '' },
      },
      { upsert: true, new: true }
    );

    res.json(superadminCourtResponse(court));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/payout-transfers', async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100)));
    const status = String(req.query.status || 'all');
    const query = {};
    if (status !== 'all') query.status = status;
    const transfers = await PayoutTransfer.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('courtId', 'name slug')
      .lean();
    res.json(transfers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;