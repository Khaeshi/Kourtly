import { createXenditInvoice } from '../../services/xenditService.js';

export function getPaymentProvider() {
  if (process.env.PAYMENT_PROVIDER) return process.env.PAYMENT_PROVIDER.toLowerCase();
  return ['production', 'test'].includes(process.env.NODE_ENV) ? 'xendit' : 'mock';
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
  forUserId,
}) {
  const provider = getPaymentProvider();
  if (provider === 'mock') {
    return {
      id: `mock-${referenceId}`,
      payment_url: `${successUrl}${successUrl.includes('?') ? '&' : '?'}mockPayment=1`,
      qr_string: 'MOCK-PAYMENT',
    };
  }
  if (provider !== 'xendit') {
    throw new Error(`Unsupported payment provider: ${provider}`);
  }
  return createXenditInvoice({
    referenceId,
    amount,
    description,
    payerEmail,
    successUrl,
    failureUrl,
    expiryDate,
    metadata,
    forUserId,
  });
}
