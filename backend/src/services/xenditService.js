const XENDIT_BASE_URL = process.env.XENDIT_BASE_URL || 'https://api.xendit.co';

function getAuthHeader() {
  const key = process.env.XENDIT_SECRET_KEY || '';
  const token = Buffer.from(`${key}:`).toString('base64');
  return `Basic ${token}`;
}

export async function createInvoice({
  externalId,
  amount,
  description,
  payerEmail,
  successRedirectUrl,
  failureRedirectUrl,
  expiryDate,
}) {
  const payload = {
    external_id: externalId,
    amount,
    description,
    currency: 'PHP',
    payment_methods: ['QRPH', 'GCASH', 'PAYMAYA', 'BPI', 'BDO'],
    success_redirect_url: successRedirectUrl,
    failure_redirect_url: failureRedirectUrl,
    invoice_duration: Math.max(1, Math.floor((expiryDate.getTime() - Date.now()) / 1000)),
    customer: payerEmail ? { email: payerEmail } : undefined,
  };

  const res = await fetch(`${XENDIT_BASE_URL}/v2/invoices`, {
    method: 'POST',
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Xendit create invoice failed: ${err}`);
  }
  return res.json();
}

export function isWebhookAuthorized(headers) {
  const token = process.env.XENDIT_WEBHOOK_TOKEN || '';
  if (!token) return false;
  return headers['x-callback-token'] === token;
}

export async function createDisbursement({
  externalId,
  amount,
  recipientCode,
  description,
}) {
  const res = await fetch(`${XENDIT_BASE_URL}/disbursements`, {
    method: 'POST',
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      external_id: externalId,
      amount,
      beneficiary_name: description,
      description,
      recipient_code: recipientCode,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Xendit disbursement failed: ${err}`);
  }
  return res.json();
}

