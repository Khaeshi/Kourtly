import crypto from 'node:crypto';
import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import Court from '../../src/models/Court.js';

describe('court Xendit setup routes', () => {
  const savedEnv = {};
  let fetchSpy;

  beforeEach(() => {
    for (const key of [
      'ALLOW_TEST_AUTH_BYPASS',
      'XENDIT_SECRET_KEY',
      'XENDIT_WEBHOOK_URL',
    ]) {
      savedEnv[key] = process.env[key];
    }
    process.env.ALLOW_TEST_AUTH_BYPASS = 'true';
    process.env.XENDIT_SECRET_KEY = 'xnd_development_test';
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
    fetchSpy = undefined;
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  async function createApprovedCourt(slug) {
    return Court.create({
      name: 'Setup Court',
      slug,
      adminEmail: `${slug}@example.com`,
      isActive: true,
      registrationStatus: 'approved',
      subscription: { status: 'active' },
    });
  }

  function asCourtAdmin(courtId, method, path) {
    return request(app)[method](path)
      .set('x-court-id', String(courtId))
      .set('x-user-role', 'admin');
  }

  test('creates and links one Managed account without returning its ID', async () => {
    const court = await createApprovedCourt('xendit-create');
    const requests = [];
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
      requests.push({ url: String(url), options });
      if (String(url).includes('/v2/accounts?')) {
        return { ok: true, json: async () => ({ data: [], has_more: false }) };
      }
      return {
        ok: true,
        json: async () => ({ id: 'managed-account-1', status: 'INVITED' }),
      };
    });

    const response = await asCourtAdmin(court._id, 'post', '/api/court/me/xendit/setup');

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ status: 'INVITED' });
    expect(requests).toHaveLength(2);
    expect(requests[0].url).toContain('/v2/accounts?');
    expect(requests[1].options.method).toBe('POST');
    expect(requests[1].url).toContain('/v2/accounts');
    expect(JSON.parse(requests[1].options.body)).toEqual({
      email: court.adminEmail,
      type: 'MANAGED',
      public_profile: { business_name: court.name },
    });

    const storedCourt = await Court.findById(court._id)
      .select('+xendit.subAccountId +xendit.setupInProgress')
      .lean();
    expect(storedCourt.xendit.subAccountId).toBe('managed-account-1');
    expect(storedCourt.xendit.setupInProgress).toBe(false);
    expect(response.body).not.toHaveProperty('subAccountId');

    const profile = await asCourtAdmin(court._id, 'get', '/api/court/me');
    expect(profile.status).toBe(200);
    expect(profile.body.xendit).toEqual({ status: 'INVITED' });
  });

  test('refreshes a registered account, configures its webhook, and stores only a token hash', async () => {
    process.env.XENDIT_WEBHOOK_URL = 'https://kourtly.example/api/payments/xendit/webhook';
    const court = await createApprovedCourt('xendit-refresh');
    court.xendit.subAccountId = 'managed-account-2';
    await court.save();
    fetchSpy = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'managed-account-2', status: 'REGISTERED' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ callback_token: 'one-time-callback-secret', user_id: 'managed-account-2' }),
      });

    const response = await asCourtAdmin(court._id, 'post', '/api/court/me/xendit/refresh');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'REGISTERED' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1][1].headers['for-user-id']).toBe('managed-account-2');

    const storedCourt = await Court.findById(court._id)
      .select('+xendit.callbackTokenHash')
      .lean();
    expect(storedCourt.xendit.callbackTokenHash).toBe(
      crypto.createHash('sha256').update('one-time-callback-secret').digest('hex'),
    );
    expect(storedCourt.xendit.webhookConfigured).toBe(true);
    expect(response.body).not.toHaveProperty('callbackTokenHash');
    expect(response.body).not.toHaveProperty('subAccountId');
  });

  test('recovers a lost create response by finding the Managed account by court admin email', async () => {
    const court = await createApprovedCourt('xendit-recovery');
    court.xendit.setupInProgress = true;
    court.xendit.setupStartedAt = new Date(Date.now() - 120_001);
    await court.save();
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{
          id: 'recovered-managed-account',
          email: court.adminEmail,
          type: 'MANAGED',
          status: 'INVITED',
        }],
        has_more: false,
      }),
    });

    const response = await asCourtAdmin(court._id, 'post', '/api/court/me/xendit/setup');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'INVITED' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/v2/accounts?');
    const storedCourt = await Court.findById(court._id).select('+xendit.subAccountId').lean();
    expect(storedCourt.xendit.subAccountId).toBe('recovered-managed-account');
  });

  test('takes over a stale setup claim', async () => {
    const court = await createApprovedCourt('xendit-stale-claim');
    court.xendit.setupInProgress = true;
    court.xendit.setupStartedAt = new Date(Date.now() - 120_001);
    await court.save();
    fetchSpy = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [], has_more: false }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'stale-claim-account', status: 'INVITED' }),
      });

    const response = await asCourtAdmin(court._id, 'post', '/api/court/me/xendit/setup');

    expect(response.status).toBe(201);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const storedCourt = await Court.findById(court._id)
      .select('+xendit.subAccountId +xendit.setupInProgress +xendit.setupStartedAt')
      .lean();
    expect(storedCourt.xendit.subAccountId).toBe('stale-claim-account');
    expect(storedCourt.xendit.setupInProgress).toBe(false);
    expect(storedCourt.xendit.setupStartedAt ?? null).toBeNull();
  });

  test('blocks an active setup claim', async () => {
    const court = await createApprovedCourt('xendit-active-claim');
    court.xendit.setupInProgress = true;
    court.xendit.setupStartedAt = new Date();
    await court.save();
    fetchSpy = jest.spyOn(globalThis, 'fetch');

    const response = await asCourtAdmin(court._id, 'post', '/api/court/me/xendit/setup');

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('setup already in progress');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('a stale crash marker with no matching account creates one', async () => {
    const court = await createApprovedCourt('xendit-crash-retry');
    court.xendit.setupInProgress = true;
    court.xendit.setupStartedAt = new Date(Date.now() - 120_001);
    await court.save();
    fetchSpy = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [], has_more: false }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'crash-retry-account', status: 'INVITED' }),
      });

    const response = await asCourtAdmin(court._id, 'post', '/api/court/me/xendit/setup');

    expect(response.status).toBe(201);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[1][0])).toContain('/v2/accounts');
  });

  test('adopts a matching account that is not linked to another court', async () => {
    const court = await createApprovedCourt('xendit-adoption');
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{
          id: 'unlinked-managed-account',
          email: court.adminEmail,
          type: 'MANAGED',
          status: 'INVITED',
        }],
        has_more: false,
      }),
    });

    const response = await asCourtAdmin(court._id, 'post', '/api/court/me/xendit/setup');

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/v2/accounts?');
    const storedCourt = await Court.findById(court._id).select('+xendit.subAccountId').lean();
    expect(storedCourt.xendit.subAccountId).toBe('unlinked-managed-account');
  });

  test('rejects an account linked to another court and releases the claim', async () => {
    const court = await createApprovedCourt('xendit-cross-court');
    const otherCourt = await createApprovedCourt('xendit-other-court');
    otherCourt.xendit.subAccountId = 'already-linked-account';
    await otherCourt.save();
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{
          id: 'already-linked-account',
          email: court.adminEmail,
          type: 'MANAGED',
          status: 'REGISTERED',
        }],
        has_more: false,
      }),
    });

    const response = await asCourtAdmin(court._id, 'post', '/api/court/me/xendit/setup');

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('This email already has a payments account on another venue.');
    const storedCourt = await Court.findById(court._id)
      .select('+xendit.setupInProgress +xendit.setupStartedAt')
      .lean();
    expect(storedCourt.xendit.setupInProgress).toBe(false);
    expect(storedCourt.xendit.setupStartedAt ?? null).toBeNull();
  });

  test('rejects ambiguous account lookup with a generic conflict and releases the claim', async () => {
    const court = await createApprovedCourt('xendit-ambiguous');
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'ambiguous-account-1', email: court.adminEmail, type: 'MANAGED', status: 'INVITED' },
          { id: 'ambiguous-account-2', email: court.adminEmail, type: 'MANAGED', status: 'INVITED' },
        ],
        has_more: false,
      }),
    });

    const response = await asCourtAdmin(court._id, 'post', '/api/court/me/xendit/setup');

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('Unable to uniquely identify a Xendit account for this venue.');
    const storedCourt = await Court.findById(court._id)
      .select('+xendit.setupInProgress +xendit.setupStartedAt')
      .lean();
    expect(storedCourt.xendit.setupInProgress).toBe(false);
    expect(storedCourt.xendit.setupStartedAt ?? null).toBeNull();
  });

  test('retries a create timeout by looking up and adopting the created account', async () => {
    const court = await createApprovedCourt('xendit-timeout-retry');
    let createRequests = 0;
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async url => {
      if (String(url).includes('/v2/accounts?')) {
        if (createRequests === 0) {
          return { ok: true, json: async () => ({ data: [], has_more: false }) };
        }
        return {
          ok: true,
          json: async () => ({
            data: [{
              id: 'created-before-timeout',
              email: court.adminEmail,
              type: 'MANAGED',
              status: 'INVITED',
            }],
            has_more: false,
          }),
        };
      }
      createRequests += 1;
      throw new Error('simulated timeout');
    });

    const failed = await asCourtAdmin(court._id, 'post', '/api/court/me/xendit/setup');
    expect(failed.status).toBe(502);
    const releasedCourt = await Court.findById(court._id)
      .select('+xendit.setupInProgress +xendit.setupStartedAt')
      .lean();
    expect(releasedCourt.xendit.setupInProgress).toBe(false);
    expect(releasedCourt.xendit.setupStartedAt ?? null).toBeNull();

    const retry = await asCourtAdmin(court._id, 'post', '/api/court/me/xendit/setup');
    expect(retry.status).toBe(200);
    expect(createRequests).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/v2/accounts?');
    expect(String(fetchSpy.mock.calls[1][0])).toContain('/v2/accounts');
    expect(String(fetchSpy.mock.calls[2][0])).toContain('/v2/accounts?');
    const storedCourt = await Court.findById(court._id).select('+xendit.subAccountId').lean();
    expect(storedCourt.xendit.subAccountId).toBe('created-before-timeout');
  });

  test('simultaneous setup requests create at most one account', async () => {
    const court = await createApprovedCourt('xendit-concurrent');
    let createRequests = 0;
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async url => {
      if (String(url).includes('/v2/accounts?')) {
        return { ok: true, json: async () => ({ data: [], has_more: false }) };
      }
      createRequests += 1;
      return { ok: true, json: async () => ({ id: 'single-created-account', status: 'INVITED' }) };
    });

    const [first, second] = await Promise.all([
      asCourtAdmin(court._id, 'post', '/api/court/me/xendit/setup'),
      asCourtAdmin(court._id, 'post', '/api/court/me/xendit/setup'),
    ]);

    expect([first.status, second.status].every(status => [200, 201, 409].includes(status))).toBe(true);
    expect(createRequests).toBe(1);
    const storedCourt = await Court.findById(court._id).select('+xendit.subAccountId').lean();
    expect(storedCourt.xendit.subAccountId).toBe('single-created-account');
  });

  test('setup emits no log containing email, callback token, or account response body', async () => {
    const court = await createApprovedCourt('xendit-no-sensitive-logs');
    const sensitiveEmail = court.adminEmail;
    const accountResponseBody = { id: 'not-logged-account-id', status: 'INVITED' };
    fetchSpy = jest.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [], has_more: false }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => accountResponseBody,
      });
    const logSpies = ['log', 'warn', 'error'].map(method =>
      jest.spyOn(console, method).mockImplementation(() => {}),
    );
    try {
      const response = await asCourtAdmin(court._id, 'post', '/api/court/me/xendit/setup');
      expect(response.status).toBe(201);
      const logged = logSpies.flatMap(spy => spy.mock.calls.flat()).map(String).join('\n');
      expect(logged).not.toContain(sensitiveEmail);
      expect(logged).not.toContain('not-logged-account-id');
      expect(logged).not.toContain(JSON.stringify(accountResponseBody));
      expect(logged).not.toContain('one-time-callback-secret');
    } finally {
      logSpies.forEach(spy => spy.mockRestore());
    }
  });
});
