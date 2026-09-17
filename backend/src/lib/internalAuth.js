import crypto from 'node:crypto';
import User from '../models/User.js';

const AUTH_HEADER = 'x-playkou-auth';
const MAX_CLOCK_SKEW_SECONDS = 30;
const MAX_ASSERTION_AGE_SECONDS = 5 * 60;

function getSecret() {
  return process.env.PLAYKOU_INTERNAL_AUTH_SECRET || process.env.NEXTAUTH_SECRET || '';
}

export function verifyInternalAssertion(value) {
  const secret = getSecret();
  if (!secret || !value) return null;

  const [encodedPayload, encodedSignature] = String(value).split('.');
  if (!encodedPayload || !encodedSignature) return null;

  const expectedSignature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  const supplied = Buffer.from(encodedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (!payload.email || !payload.iat || !payload.exp) return null;
    if (payload.exp < now - MAX_CLOCK_SKEW_SECONDS || payload.iat > now + MAX_CLOCK_SKEW_SECONDS) return null;
    if (now - payload.iat > MAX_ASSERTION_AGE_SECONDS) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getInternalAuthHeader() {
  return AUTH_HEADER;
}

export async function getAuthenticatedUser(req) {
  const assertion = verifyInternalAssertion(req.headers[AUTH_HEADER]);
  if (assertion?.email) {
    return User.findOne({ email: assertion.email.toLowerCase() }).lean();
  }

  const testBypassAllowed =
    process.env.NODE_ENV === 'test' && process.env.ALLOW_TEST_AUTH_BYPASS === 'true';

  if (testBypassAllowed && (req.headers['x-court-id'] || req.headers['x-user-role'] === 'superadmin')) {
    return {
      email: 'test@example.com',
      role: req.headers['x-user-role'] ?? 'user',
      courtId: req.headers['x-court-id'],
    };
  }

  return null;
}