import { createCocoartPayment, isCocoartWebhookAuthorized } from '../../services/cocoartService.js';

export function getPaymentProvider() {
  return (process.env.PAYMENT_PROVIDER || 'cocoart').toLowerCase();
}

export async function createPaymentLink({
  amount,
  description,
  referenceId,
  payerEmail,
  successUrl,
  failureUrl,
  expiryDate,
  metadata = {},
}) {
  const provider = getPaymentProvider();
  if (provider !== 'cocoart') {
    throw new Error(`Unsupported payment provider: ${provider}`);
  }
  return createCocoartPayment({
    referenceId,
    amount,
    description,
    payerEmail,
    successUrl,
    failureUrl,
    expiryDate,
    metadata,
  });
}

export function verifyWebhookSignature(payload, headers) {
  const provider = getPaymentProvider();
  if (provider !== 'cocoart') return false;
  return isCocoartWebhookAuthorized(headers, payload);
}
