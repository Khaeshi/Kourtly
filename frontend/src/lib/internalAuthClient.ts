import crypto from 'node:crypto';

export function createInternalAssertion(user: { email?: string | null }) {
  const secret =
    process.env.KOURTLY_INTERNAL_AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET;

  if (!secret) {
    throw new Error('KOURTLY_INTERNAL_AUTH_SECRET is not configured.');
  }
  if (!user.email) {
    throw new Error('User email is required to sign an internal assertion.');
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ email: user.email.toLowerCase(), iat: now, exp: now + 300 })
  ).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}