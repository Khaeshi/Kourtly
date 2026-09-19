import crypto from 'node:crypto';

const XENDIT_API_BASE = 'https://api.xendit.co';

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
}) {
  const nowMs = Date.now();
  const expiryMs = expiryDate ? new Date(expiryDate).getTime() : nowMs + 30 * 60 * 1000;
  const invoiceDurationSeconds = Math.max(60, Math.floor((expiryMs - nowMs) / 1000));

  const response = await fetch(`${XENDIT_API_BASE}/v2/invoices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(),
    },
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