import { jest } from '@jest/globals';
import { createPaymentLink } from '../../src/lib/payments/index.js';

describe('Xendit invoice account routing', () => {
  const savedEnv = {};

  beforeEach(() => {
    for (const key of ['PAYMENT_PROVIDER', 'XENDIT_SECRET_KEY']) {
      savedEnv[key] = process.env[key];
    }
    process.env.PAYMENT_PROVIDER = 'xendit';
    process.env.XENDIT_SECRET_KEY = 'xnd_development_test';
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    jest.restoreAllMocks();
  });

  test('sends reservation invoices with the court sub-account for-user-id', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'invoice-reservation', invoice_url: 'https://checkout.test' }),
    });

    await createPaymentLink({
      amount: 250,
      description: 'Reservation',
      referenceId: 'reservation-reference',
      payerEmail: 'customer@example.com',
      successUrl: 'https://app.test/success',
      failureUrl: 'https://app.test/failure',
      forUserId: 'court-sub-account',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][1].headers['for-user-id']).toBe('court-sub-account');
  });

  test('leaves subscription invoices on the master account when forUserId is omitted', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'invoice-subscription', invoice_url: 'https://checkout.test' }),
    });

    await createPaymentLink({
      amount: 2000,
      description: 'Subscription',
      referenceId: 'SUB-court-tier',
      payerEmail: 'admin@example.com',
      successUrl: 'https://app.test/success',
      failureUrl: 'https://app.test/failure',
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][1].headers).not.toHaveProperty('for-user-id');
  });
});
