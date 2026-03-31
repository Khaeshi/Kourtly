import mongoose from 'mongoose';
import Court from '../models/Court.js';

export async function tenantMiddleware(req, res, next) {
  const path = req.path;

  // Exempt auth-related user routes — called by NextAuth with no court context
  if (path === '/upsert' || path.startsWith('/by-email')) {
    return next();
  }

  const courtId = req.headers['x-court-id'];
  const role    = req.headers['x-user-role'];

  // Superadmin — platform-wide access
  if (role === 'superadmin') {
    req.courtId  = null;
    req.userRole = 'superadmin';
    return next();
  }

  if (!courtId) {
    return res.status(401).json({ error: 'Missing court context. Please sign in again.' });
  }

  if (!mongoose.Types.ObjectId.isValid(courtId)) {
    return res.status(400).json({ error: 'Invalid court ID.' });
  }

  const court = await Court.findById(courtId).select('isActive subscription').lean();

  if (!court || !court.isActive) {
    return res.status(403).json({ error: 'Court not found or inactive.' });
  }

  if (court.subscription.status === 'expired' || court.subscription.status === 'suspended') {
    return res.status(402).json({ error: 'Court subscription has expired.' });
  }

  req.courtId  = courtId;
  req.userRole = role ?? 'user';
  next();
}