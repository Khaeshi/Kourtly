import mongoose from 'mongoose';
import Court from '../models/Court.js';
import { getAuthenticatedUser } from '../lib/internalAuth.js';

export async function tenantMiddleware(req, res, next) {
  const path = req.path;

  // Exempt auth-related user routes
  if (path === '/upsert' || path.startsWith('/by-email')) {
    return next();
  }

  // Add court creation + public routes
  const skipTenantCheck = [
    '/api/public/court',     
    '/api/public/courts',             
    '/api/users/me'          
  ];

  if (skipTenantCheck.some(skipPath => req.path === skipPath || req.path.startsWith(skipPath + '/'))) {
    console.log(' Skipping tenant for:', req.path);
    req.courtId = null;
    return next();
  }

  const user = await getAuthenticatedUser(req);

  if (!user) {
    return res.status(401).json({ error: 'Invalid or missing authenticated identity.' });
  }

  const courtId = user.courtId;
  const role = user.role;

  // Superadmin bypass
  if (role === 'superadmin') {
    req.courtId = null;
    req.userRole = 'superadmin';
    req.user = user;
    return next();
  }

  if (!courtId) {
    return res.status(401).json({ 
      error: 'Missing court context. Please sign in again.' 
    });
  }

  // Rest unchanged...
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

  req.courtId = courtId;
  req.court = court;
  req.userRole = role ?? 'user';
  req.user = user;
  next();
}