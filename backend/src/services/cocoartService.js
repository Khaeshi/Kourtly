const COCOART_BASE_URL = process.env.COCOART_BASE_URL || 'https://api.cocoartpay.com';

function getAuthHeader() {
  const key = process.env.COCOART_API_KEY || '';
  return `Bearer ${key}`;
}

export async function createCocoartPayment({
  referenceId,
  amount,
  description,
  payerEmail,
  successUrl,
  failureUrl,
  expiryDate,
  metadata = {},
}) {
  const payload = {
    reference_id: referenceId,
    amount,
    currency: 'PHP',
    description,
    customer: payerEmail ? { email: payerEmail } : undefined,
    success_url: successUrl,
    failure_url: failureUrl,
    expires_at: expiryDate.toISOString(),
    metadata,
  };

  const res = await fetch(`${COCOART_BASE_URL}/v1/payments`, {
    method: 'POST',
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cocoart create payment failed: ${err}`);
  }

  return res.json();
}

export function isCocoartWebhookAuthorized(headers) {
  const secret = process.env.COCOART_WEBHOOK_SECRET || '';
  if (!secret) return false;
  return headers['x-cocoart-webhook-secret'] === secret;
}
