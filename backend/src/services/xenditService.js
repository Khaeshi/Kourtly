import crypto from 'node:crypto';

const XENDIT_API_BASE = 'https://api.xendit.co';
const XENDIT_WEBHOOK_PATH = '/api/payments/xendit/webhook';

function ambiguousManagedAccountListError() {
  const error = new Error('Multiple Xendit accounts match this email.');
  error.code = 'XENDIT_ACCOUNT_LIST_AMBIGUOUS';
  return error;
}

/**
 * @typedef {Object} XenditAccount
 * @property {string} id
 * @property {string} created
 * @property {string} updated
 * @property {string} email
 * @property {'MANAGED' | string} type
 * @property {{ business_name: string }} public_profile
 * @property {string} country
 * @property {string} status
 */

/**
 * @param {unknown} response
 * @param {string} email
 * @returns {XenditAccount | null}
 */
export function parseManagedAccountList(response, email) {
  if (
    typeof response !== 'object' ||
    response === null ||
    !Array.isArray(response.data)
  ) {
    throw new Error('Unexpected Xendit account-list response.');
  }
  if (response.has_more === true) {
    throw ambiguousManagedAccountListError();
  }

  const matches = response.data.filter(account =>
    account?.type === 'MANAGED' &&
    typeof account.email === 'string' &&
    account.email.toLowerCase() === email.toLowerCase()
  );
  if (matches.length > 1) {
    throw ambiguousManagedAccountListError();
  }
  if (matches.some(account => typeof account.id !== 'string' || !account.id || typeof account.status !== 'string')) {
    throw new Error('Unexpected Xendit account-list response.');
  }
  return matches[0] ?? null;
}

export function getXenditMode(secretKey = process.env.XENDIT_SECRET_KEY) {
  if (!secretKey) return null;
  if (secretKey.startsWith('xnd_development_')) return 'development';
  if (secretKey.startsWith('xnd_production_')) return 'production';
  throw new Error('XENDIT_SECRET_KEY has an unsupported prefix.');
}

export function isValidXenditWebhookUrl(value = process.env.XENDIT_WEBHOOK_URL) {
  if (!value) return false;
  try {
    const url = new URL(value);
    const authority = value.match(/^https:\/\/([^/?#]+)/i)?.[1];
    if (
      url.protocol !== 'https:' ||
      url.pathname !== XENDIT_WEBHOOK_PATH ||
      !authority ||
      authority.includes('@') ||
      /:\d+$/.test(authority) ||
      url.hostname === 'localhost' ||
      url.hostname.endsWith('.localhost') ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '[::1]' ||
      Boolean(url.hash)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function xenditRequest(path, options = {}) {
  const response = await fetch(`${XENDIT_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: authHeader(),
      ...options.headers,
    },
    signal: AbortSignal.timeout(10_000),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Unexpected Xendit response.');
  }
  if (!response.ok) {
    throw new Error(`Xendit request failed: ${response.status}`);
  }
  return data;
}

export async function listManagedAccountsByEmail(email) {
  const query = new URLSearchParams({ email });
  const data = await xenditRequest(`/v2/accounts?${query}`);
  return parseManagedAccountList(data, email);
}

export async function createManagedAccount({ email, businessName }) {
  const data = await xenditRequest('/v2/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      type: 'MANAGED',
      public_profile: { business_name: businessName },
    }),
  });
  if (typeof data?.id !== 'string' || typeof data?.status !== 'string') {
    throw new Error('Unexpected Xendit account-creation response.');
  }
  return data;
}

export async function getManagedAccount(accountId) {
  const data = await xenditRequest(`/v2/accounts/${encodeURIComponent(accountId)}`);
  if (typeof data?.id !== 'string' || typeof data?.status !== 'string') {
    throw new Error('Unexpected Xendit account response.');
  }
  return data;
}

export async function configureManagedAccountInvoiceWebhook({ subAccountId, url }) {
  const data = await xenditRequest('/callback_urls/invoice', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'for-user-id': subAccountId,
    },
    body: JSON.stringify({ url }),
  });
  if (
    typeof data?.callback_token !== 'string' ||
    data.user_id !== subAccountId
  ) {
    throw new Error('Unexpected Xendit callback configuration response.');
  }
  return data.callback_token;
}

function getSecretKey() {
  const key = process.env.XENDIT_SECRET_KEY;
  if (!key) throw new Error('XENDIT_SECRET_KEY is not configured.');
  return key;
}

function getCallbackToken() {
  return process.env.XENDIT_CALLBACK_TOKEN || '';
}

function authHeader() {
  const encoded = Buffer.from(`${getSecretKey()}:`).toString('base64');
  return `Basic ${encoded}`;
}

export async function createXenditInvoice({
  amount,
  description,
  referenceId,
  payerEmail,
  successUrl,
  failureUrl,
  expiryDate,
  metadata = {},
  forUserId,
}) {
  const nowMs = Date.now();
  const expiryMs = expiryDate ? new Date(expiryDate).getTime() : nowMs + 30 * 60 * 1000;
  const invoiceDurationSeconds = Math.max(60, Math.floor((expiryMs - nowMs) / 1000));

  const headers = {
    'Content-Type': 'application/json',
    Authorization: authHeader(),
  };
  if (forUserId) headers['for-user-id'] = forUserId;

  const response = await fetch(`${XENDIT_API_BASE}/v2/invoices`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      external_id: referenceId,
      amount,
      description,
      payer_email: payerEmail,
      invoice_duration: invoiceDurationSeconds,
      success_redirect_url: successUrl,
      failure_redirect_url: failureUrl,
      metadata,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Xendit invoice creation failed: ${data?.message || response.status}`);
  }

  return {
    id: data.id,
    payment_url: data.invoice_url,
    qr_string: null, // Invoices product returns a hosted checkout URL, not a raw QR string
  };
}

export function isXenditWebhookAuthorized(headers) {
  const expected = getCallbackToken();
  const supplied = headers['x-callback-token'];
  if (!expected || !supplied) return false;

  const expectedBuf = Buffer.from(expected);
  const suppliedBuf = Buffer.from(String(supplied));
  if (expectedBuf.length !== suppliedBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, suppliedBuf);
}