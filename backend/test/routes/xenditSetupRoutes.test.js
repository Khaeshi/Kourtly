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
    expect(requests[1].options.method).toBe('POST');
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
    court.xendit.setupStartedAt = new Date();
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
});
