import rateLimit from 'express-rate-limit';

// These limiters use express-rate-limit's default IP key. Tenant/admin routes
// could use authenticated user IDs instead, but remain IP-keyed for defense-in-depth.
export const publicCostlyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

export const publicReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

export const authAdjacentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

export const tenantAdminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

export const superadminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

export const limitMethods = (limiter, methods) => (req, res, next) => (
  methods.includes(req.method) ? limiter(req, res, next) : next()
);
