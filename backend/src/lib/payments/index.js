import { createCocoartPayment, isCocoartWebhookAuthorized } from '../../services/cocoartService.js';

export function getPaymentProvider() {
  if (process.env.PAYMENT_PROVIDER) return process.env.PAYMENT_PROVIDER.toLowerCase();
  return ['production', 'test'].includes(process.env.NODE_ENV) ? 'cocoart' : 'mock';
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
  if (provider === 'mock') {
    return {
      id: `mock-${referenceId}`,
      payment_url: `${successUrl}${successUrl.includes('?') ? '&' : '?'}mockPayment=1`,
      qr_string: 'MOCK-PAYMENT',
    };
  }
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
