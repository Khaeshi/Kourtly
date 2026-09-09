export const MODULES = {
  BOOKING: 'booking',
  QUEUE: 'queue',
  ITEM_TABS: 'item_tabs',
};

export const TIERS = {
  BASIC: 'basic',
  STANDARD: 'standard',
  PREMIUM: 'premium',
  ELITE: 'elite',
};

export const TIER_ORDER = [TIERS.BASIC, TIERS.STANDARD, TIERS.PREMIUM, TIERS.ELITE];

const TIER_MODULES = {
  [TIERS.BASIC]: [MODULES.BOOKING],
  [TIERS.STANDARD]: [MODULES.BOOKING, MODULES.QUEUE],
  [TIERS.PREMIUM]: [MODULES.BOOKING, MODULES.QUEUE, MODULES.ITEM_TABS],
  [TIERS.ELITE]: [MODULES.BOOKING, MODULES.QUEUE, MODULES.ITEM_TABS],
};

export const TIER_DETAILS = {
  [TIERS.BASIC]: {
    label: 'Basic',
    description: 'Online reservations and court schedule blocking for getting started.',
    price: 2000,
  },
  [TIERS.STANDARD]: {
    label: 'Standard',
    description: 'Everything in Basic, plus player registration and live queue management.',
    price: 3500,
  },
  [TIERS.PREMIUM]: {
    label: 'Premium',
    description: 'Everything in Standard, plus item catalogs, tabs, and billing workflows.',
    price: 5000,
  },
  [TIERS.ELITE]: {
    label: 'Elite',
    description: 'Everything in Premium, with priority support and future advanced capabilities.',
    price: 7500,
  },
};

export const MODULE_LABELS = {
  [MODULES.BOOKING]: 'Booking & scheduling',
  [MODULES.QUEUE]: 'Queue management',
  [MODULES.ITEM_TABS]: 'Item tabs',
};

export function resolveCapabilities(court) {
  const storedTier = TIER_MODULES[court?.subscription?.tier] ? court.subscription.tier : TIERS.BASIC;
  const pendingIsEffective = court?.subscription?.pendingTier && court.subscription.pendingTierEffectiveAt
    && new Date(court.subscription.pendingTierEffectiveAt) <= new Date();
  const tier = pendingIsEffective && TIER_MODULES[court.subscription.pendingTier]
    ? court.subscription.pendingTier
    : storedTier;
  const currentTier = tier;
  const enabled = new Set(TIER_MODULES[tier]);
  const now = new Date();

  for (const override of court?.subscription?.modules ?? []) {
    if (!override?.key || !Object.values(MODULES).includes(override.key)) continue;
    if (override.expiresAt && new Date(override.expiresAt) <= now) continue;
    if (override.enabled) enabled.add(override.key);
    else enabled.delete(override.key);
  }

  const modules = Object.values(MODULES).reduce((result, key) => {
    result[key] = enabled.has(key);
    return result;
  }, {});

  return {
    tier,
    currentTier,
    pendingTier: pendingIsEffective ? null : court?.subscription?.pendingTier ?? null,
    pendingTierEffectiveAt: pendingIsEffective ? null : court?.subscription?.pendingTierEffectiveAt ?? null,
    modules,
  };
}

export function hasModule(court, moduleKey) {
  return resolveCapabilities(court).modules[moduleKey] === true;
}

export function requireModule(moduleKey) {
  return (req, res, next) => {
    if (!req.court) {
      return res.status(500).json({ error: 'Tenant context is unavailable.' });
    }

    if (!hasModule(req.court, moduleKey)) {
      return res.status(403).json({
        code: 'MODULE_NOT_ENABLED',
        module: moduleKey,
        error: `${MODULE_LABELS[moduleKey] ?? moduleKey} is not enabled for this account.`,
      });
    }

    next();
  };
}