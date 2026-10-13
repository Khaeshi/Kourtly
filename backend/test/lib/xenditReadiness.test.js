import {
  canAcceptOnlinePayments,
  ONLINE_PAYMENT_ALLOWED_STATUSES,
} from '../../src/lib/xenditReadiness.js';

describe('Xendit online payment readiness', () => {
  const originalEnv = {};

  beforeEach(() => {
    for (const key of ['XENDIT_SECRET_KEY']) {
      originalEnv[key] = process.env[key];
    }
    process.env.XENDIT_SECRET_KEY = 'xnd_development_test';
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test('allows a configured REGISTERED test-mode sub-account', () => {
    expect(canAcceptOnlinePayments({
      xendit: {
        subAccountId: 'sub-account-1',
        status: 'REGISTERED',
        webhookConfigured: true,
      },
    })).toBe(true);
  });

  test('fails readiness when account, status, or webhook configuration is missing', () => {
    const court = {
      xendit: {
        subAccountId: 'sub-account-1',
        status: 'INVITED',
        webhookConfigured: true,
      },
    };
    expect(canAcceptOnlinePayments(court)).toBe(false);
    expect(canAcceptOnlinePayments({
      xendit: { subAccountId: 'sub-account-1', status: 'REGISTERED' },
    })).toBe(false);
  });

  test('keeps production readiness closed until live status is confirmed', () => {
    expect(ONLINE_PAYMENT_ALLOWED_STATUSES.production).toEqual([]);
    process.env.XENDIT_SECRET_KEY = 'xnd_production_test';
    expect(canAcceptOnlinePayments({
      xendit: {
        subAccountId: 'sub-account-1',
        status: 'REGISTERED',
        webhookConfigured: true,
      },
    })).toBe(false);
  });
});
