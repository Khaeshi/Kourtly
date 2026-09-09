import express from 'express';
import Court from '../models/Court.js';
import User  from '../models/User.js';
import PayoutTransfer from '../models/PayoutTransfer.js';
import { MODULES, MODULE_LABELS, resolveCapabilities, TIER_DETAILS, TIERS } from '../lib/moduleEntitlements.js';
import { getAuthenticatedUser } from '../lib/internalAuth.js';

const router = express.Router();

async function requireSuperAdmin(req, res, next) {
  req.user = await getAuthenticatedUser(req);
  req.userRole = req.user?.role;
  if (req.userRole !== 'superadmin') {
    return res.status(403).json({ error: 'Superadmin access required.' });
  }
  next();
}

router.use(requireSuperAdmin);

router.get('/courts', async (req, res) => {
  try {
    const courts = await Court.find().sort({ createdAt: -1 }).lean();
    res.json(courts.map(court => ({ ...court, capabilities: resolveCapabilities(court) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
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

    const update = {
      'subscription.modules': validOverrides,
      'subscription.pendingTier': null,
      'subscription.pendingTierEffectiveAt': null,
    };
    if (tier) update['subscription.tier'] = tier;
    const court = await Court.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true },
    ).lean();
    if (!court) return res.status(404).json({ error: 'Court not found.' });
    res.json({ ...court, capabilities: resolveCapabilities(court) });
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
      const amount = c.subscription.amount ?? 2000;
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
    const { status, plan, extendTrialDays, amount } = req.body;
    const update = {};
    if (status) update['subscription.status'] = status;
    if (plan)   update['subscription.plan']   = plan;
    if (amount) update['subscription.amount'] = amount;
    if (status === 'active') {
      update['subscription.startDate']   = new Date();
      update['subscription.nextBilling'] = new Date(
        Date.now() + (plan === 'annual' ? 365 : 30) * 24 * 60 * 60 * 1000
      );
      update['isPublic'] = true;
    }
    if (extendTrialDays) {
      const court = await Court.findById(req.params.id).lean();
      const base  = new Date(court.subscription.trialEnds) > new Date()
        ? new Date(court.subscription.trialEnds) : new Date();
      base.setDate(base.getDate() + Number(extendTrialDays));
      update['subscription.trialEnds'] = base;
    }
    const court = await Court.findByIdAndUpdate(
      req.params.id, { $set: update }, { new: true, runValidators: true }
    );
    if (!court) return res.status(404).json({ error: 'Court not found.' });
    res.json(court);
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
    res.status(201).json(court);
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

    const court = await Court.findById(req.params.id);
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

    res.json(court);
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