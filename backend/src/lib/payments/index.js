import { createCocoartPayment, isCocoartWebhookAuthorized } from '../../services/cocoartService.js';

export async function createPaymentLink({
  amount,
  description,
  referenceId,
  payerEmail,
  successUrl,
  failureUrl,
  expiryDate,
}) {
  return createCocoartPayment({
    referenceId,
    amount,
    description,
    payerEmail,
    successUrl,
    failureUrl,
    expiryDate,
  });
}

export function verifyWebhookSignature(payload, headers) {
  return isCocoartWebhookAuthorized(headers, payload);
}
