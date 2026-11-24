import crypto from 'node:crypto';
import request from 'supertest';
import app from '../../src/app.js';
import Court from '../../src/models/Court.js';
import TierPricing from '../../src/models/TierPricing.js';
import User from '../../src/models/User.js';

async function superadminAuthHeader() {
  const email = 'test-superadmin@court.com';
  await User.create({ email, role: 'superadmin' });
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ email, iat: now, exp: now + 300 })).toString('base64url');
  const secret = 'superadmin-test-secret';
  process.env.KOURTLY_INTERNAL_AUTH_SECRET = secret;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

describe('user routes', () => {
  test('POST /api/users/upsert requires email', async () => {
    const res = await request(app).post('/api/users/upsert').send({ name: 'No Email' });
    expect(res.status).toBe(400);
  });

  test('POST /api/users/upsert creates and updates user', async () => {
    const first = await request(app).post('/api/users/upsert').send({
      email: 'member@test.com',
      name: 'Member One',
      provider: 'google',
    });
    expect(first.status).toBe(200);
    expect(first.body.role).toBe('user');

    const second = await request(app).post('/api/users/upsert').send({
      email: 'member@test.com',
      name: 'Member Updated',
      provider: 'google',
    });
    expect(second.status).toBe(200);
    expect(second.body.name).toBe('Member Updated');
  });
});

describe('superadmin routes', () => {
  test('blocks non-superadmin access', async () => {
    const res = await request(app).get('/api/superadmin/stats');
    expect(res.status).toBe(403);
  });

  test('GET /api/pricing/tiers returns active database prices without caching', async () => {
    await TierPricing.create([
      { tier: 'basic', price: 799, active: true },
      { tier: 'standard', price: 1499, active: false },
      { tier: 'premium', price: 2399, active: true },
    ]);

    const response = await request(app).get('/api/pricing/tiers');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.tiers).toEqual([
      { tier: 'basic', label: 'Basic', price: 799 },
      { tier: 'premium', label: 'Premium', price: 2399 },
    ]);
  });

  test('superadmin tier pricing changes keep the latest 20 price history entries', async () => {
    const auth = await superadminAuthHeader();
    const initial = await request(app)
      .put('/api/superadmin/tier-pricing/basic')
      .set('x-kourtly-auth', auth)
      .send({ price: 799 });
    expect(initial.status).toBe(200);
    expect(initial.body.history).toHaveLength(1);

    let response;
    for (let price = 800; price <= 820; price += 1) {
      response = await request(app)
        .put('/api/superadmin/tier-pricing/basic')
        .set('x-kourtly-auth', auth)
        .send({ price });
    }

    expect(response.status).toBe(200);
    expect(response.body.price).toBe(820);
    expect(response.body.history).toHaveLength(20);
    expect(response.body.history[0].price).toBe(801);
    expect(response.body.history[19].price).toBe(820);
    expect(String(response.body.updatedBy)).toBe(String(response.body.history[19].changedBy));
  });

  test.each([0, -1, 10001, 12.5, '799', null])(
    'superadmin tier pricing rejects invalid price %s',
    async price => {
      const response = await request(app)
        .put('/api/superadmin/tier-pricing/basic')
        .set('x-kourtly-auth', await superadminAuthHeader())
        .send({ price });

      expect(response.status).toBe(400);
    },
  );

  test('superadmin tier pricing rejects non-superadmin updates and unexpected fields', async () => {
    const forbidden = await request(app)
      .put('/api/superadmin/tier-pricing/basic')
      .send({ price: 799 });
    const unexpected = await request(app)
      .put('/api/superadmin/tier-pricing/basic')
      .set('x-kourtly-auth', await superadminAuthHeader())
      .send({ price: 799, amount: 1 });

    expect(forbidden.status).toBe(403);
    expect(unexpected.status).toBe(400);
  });

  test('GET /api/superadmin/tier-pricing returns editable config and history', async () => {
    const auth = await superadminAuthHeader();
    await TierPricing.create({ tier: 'elite', price: 3999, active: false });

    const response = await request(app)
      .get('/api/superadmin/tier-pricing')
      .set('x-kourtly-auth', auth);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ tier: 'elite', price: 3999, active: false, history: [] });
  });

  test('GET /api/superadmin/stats returns aggregate fields', async () => {
    await Court.create({
      name: 'SA Court',
      slug: 'sa-court',
      adminEmail: 'sa@court.com',
      subscription: { status: 'active', amount: 2000, plan: 'monthly' },
    });
    await Court.create({
      name: 'Unset Amount Court',
      slug: 'unset-amount-court',
      adminEmail: 'unset-amount@court.com',
      subscription: { status: 'active', amount: null, plan: 'monthly' },
    });
    await Court.create({
      name: 'Legacy Annual Court',
      slug: 'legacy-annual-court',
      adminEmail: 'legacy-annual@court.com',
      subscription: { status: 'active', amount: 12000, plan: 'annual' },
    });

    const res = await request(app)
      .get('/api/superadmin/stats')
      .set('x-kourtly-auth', await superadminAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total');
    expect(res.body.mrr).toBe(3000);
    expect(res.body.arr).toBe(36000);
  });

  test('subscription admin update rejects non-positive, non-integer, string, and over-limit amounts', async () => {
    const court = await Court.create({
      name: 'Subscription Amount Validation Court',
      slug: 'subscription-amount-validation-court',
      adminEmail: 'subscription-amount-validation@example.com',
      subscription: { status: 'trial', amount: null },
    });
    const auth = await superadminAuthHeader();

    for (const amount of [0, -1, 10001, 12.5, '799', null]) {
      const response = await request(app)
        .patch(`/api/superadmin/courts/${court._id}/subscription`)
        .set('x-kourtly-auth', auth)
        .send({ amount });
      expect(response.status).toBe(400);
    }

    const unchanged = await Court.findById(court._id).lean();
    expect(unchanged.subscription.amount).toBeNull();
    expect(unchanged.subscription.isCustomPrice).toBe(false);
  });

  test('subscription admin update accepts a custom price and explicit nextBilling date', async () => {
    const court = await Court.create({
      name: 'Subscription Manual Price Court',
      slug: 'subscription-manual-price-court',
      adminEmail: 'subscription-manual-price@example.com',
      subscription: { status: 'trial' },
    });
    const nextBilling = '2030-02-01';
    const response = await request(app)
      .patch(`/api/superadmin/courts/${court._id}/subscription`)
      .set('x-kourtly-auth', await superadminAuthHeader())
      .send({ status: 'active', amount: 10000, nextBilling });

    expect(response.status).toBe(200);
    expect(response.body.subscription.amount).toBe(10000);
    expect(response.body.subscription.isCustomPrice).toBe(true);
    expect(new Date(response.body.subscription.nextBilling).toISOString().slice(0, 10)).toBe(nextBilling);
  });

  test('subscription admin update rejects null and invalid nextBilling dates', async () => {
    const court = await Court.create({
      name: 'Subscription Date Validation Court',
      slug: 'subscription-date-validation-court',
      adminEmail: 'subscription-date-validation@example.com',
      subscription: { status: 'active', nextBilling: new Date('2030-01-01T00:00:00.000Z') },
    });
    const auth = await superadminAuthHeader();

    for (const nextBilling of [null, '', 'not-a-date', '2026-02-31']) {
      const response = await request(app)
        .patch(`/api/superadmin/courts/${court._id}/subscription`)
        .set('x-kourtly-auth', auth)
        .send({ nextBilling });
      expect(response.status).toBe(400);
    }

    expect((await Court.findById(court._id).lean()).subscription.nextBilling)
      .toEqual(new Date('2030-01-01T00:00:00.000Z'));
  });

  test('subscription admin update rejects new annual plans but preserves legacy annual reactivation', async () => {
    const monthly = await Court.create({
      name: 'New Annual Rejection Court',
      slug: 'new-annual-rejection-court',
      adminEmail: 'new-annual-rejection@example.com',
      subscription: { status: 'active', plan: 'monthly', amount: 799 },
    });
    const auth = await superadminAuthHeader();
    const rejected = await request(app)
      .patch(`/api/superadmin/courts/${monthly._id}/subscription`)
      .set('x-kourtly-auth', auth)
      .send({ plan: 'annual' });
    const invalidAmount = await request(app)
      .patch(`/api/superadmin/courts/${monthly._id}/subscription`)
      .set('x-kourtly-auth', auth)
      .send({ amount: 20000 });

    expect(rejected.status).toBe(400);
    expect(invalidAmount.status).toBe(400);
    expect((await Court.findById(monthly._id).lean()).subscription.plan).toBe('monthly');

    const legacy = await Court.create({
      name: 'Legacy Annual Reactivation Court',
      slug: 'legacy-annual-reactivation-court',
      adminEmail: 'legacy-annual-reactivation@example.com',
      subscription: { status: 'expired', plan: 'annual', amount: 12000 },
    });
    const reactivated = await request(app)
      .patch(`/api/superadmin/courts/${legacy._id}/subscription`)
      .set('x-kourtly-auth', auth)
      .send({ status: 'active', plan: 'annual' });

    expect(reactivated.status).toBe(200);
    expect(reactivated.body.subscription.plan).toBe('annual');
    expect(reactivated.body.subscription.amount).toBe(12000);
  });

  test('clearing a custom price restores the active database tier price', async () => {
    const court = await Court.create({
      name: 'Clear Custom Price Court',
      slug: 'clear-custom-price-court',
      adminEmail: 'clear-custom-price@example.com',
      subscription: { status: 'active', tier: 'basic', amount: 1200, isCustomPrice: true },
    });
    await TierPricing.create({ tier: 'basic', price: 799, active: true });

    const response = await request(app)
      .patch(`/api/superadmin/courts/${court._id}/subscription`)
      .set('x-kourtly-auth', await superadminAuthHeader())
      .send({ isCustomPrice: false });

    expect(response.status).toBe(200);
    expect(response.body.subscription.amount).toBe(799);
    expect(response.body.subscription.isCustomPrice).toBe(false);
  });

  test('superadmin tier changes use database price and clear custom price', async () => {
    const court = await Court.create({
      name: 'Superadmin Tier Price Court',
      slug: 'superadmin-tier-price-court',
      adminEmail: 'superadmin-tier-price@example.com',
      subscription: { status: 'active', tier: 'basic', amount: 1200, isCustomPrice: true },
    });
    await TierPricing.create({ tier: 'premium', price: 2399, active: true });

    const response = await request(app)
      .patch(`/api/superadmin/courts/${court._id}/entitlements`)
      .set('x-kourtly-auth', await superadminAuthHeader())
      .send({ tier: 'premium', overrides: [] });

    expect(response.status).toBe(200);
    expect(response.body.subscription.tier).toBe('premium');
    expect(response.body.subscription.amount).toBe(2399);
    expect(response.body.subscription.isCustomPrice).toBe(false);
  });

  test('setting the current tier does not clear a custom price', async () => {
    const court = await Court.create({
      name: 'Superadmin Same Tier Court',
      slug: 'superadmin-same-tier-court',
      adminEmail: 'superadmin-same-tier@example.com',
      subscription: { status: 'active', tier: 'basic', amount: 1200, isCustomPrice: true },
    });

    const response = await request(app)
      .patch(`/api/superadmin/courts/${court._id}/entitlements`)
      .set('x-kourtly-auth', await superadminAuthHeader())
      .send({ tier: 'basic', overrides: [] });

    expect(response.status).toBe(200);
    expect(response.body.subscription.amount).toBe(1200);
    expect(response.body.subscription.isCustomPrice).toBe(true);
  });

  test('GET /api/superadmin/courts exposes account ID but never the callback-token hash', async () => {
    await Court.create({
      name: 'Xendit Superadmin Court',
      slug: 'xendit-superadmin-court',
      adminEmail: 'xendit-admin@court.com',
      registrationStatus: 'approved',
      xendit: {
        subAccountId: 'managed-account-visible-to-superadmin',
        status: 'REGISTERED',
        callbackTokenHash: 'must-not-be-returned',
      },
    });

    const response = await request(app)
      .get('/api/superadmin/courts')
      .set('x-kourtly-auth', await superadminAuthHeader());

    expect(response.status).toBe(200);
    expect(response.body[0].xendit).toEqual({
      status: 'REGISTERED',
      subAccountId: 'managed-account-visible-to-superadmin',
    });
    expect(response.body[0].xendit).not.toHaveProperty('callbackTokenHash');
  });

  test('POST /api/superadmin/courts validates required fields', async () => {
    const res = await request(app)
      .post('/api/superadmin/courts')
      .set('x-kourtly-auth', await superadminAuthHeader())
      .send({ name: 'Missing fields' });

    expect(res.status).toBe(400);
  });

  test('POST /api/superadmin/courts creates court and links admin user', async () => {
    const res = await request(app)
      .post('/api/superadmin/courts')
      .set('x-kourtly-auth', await superadminAuthHeader())
      .send({
        name: 'Created by SA',
        slug: 'created-by-sa',
        adminEmail: 'new-admin@court.com',
      });

    expect(res.status).toBe(201);
    const court = await Court.findOne({ slug: 'created-by-sa' }).lean();
    const user = await User.findOne({ email: 'new-admin@court.com' }).lean();
    expect(court.registrationStatus).toBe('approved');
    expect(user).toBeTruthy();
    expect(user.role).toBe('admin');
  });

  test('GET /api/superadmin/courts/pending lists pending registrations', async () => {
    const registrant = await User.create({ email: 'registrant@court.com' });
    const pending = await Court.create({
      name: 'Pending Court',
      slug: 'pending-review',
      adminEmail: 'pending@court.com',
      registeredBy: registrant._id,
      registrationStatus: 'pending',
      subscription: { status: 'pending' },
    });
    await Court.create({
      name: 'Approved Court',
      slug: 'already-approved',
      adminEmail: 'approved@court.com',
      registrationStatus: 'approved',
      subscription: { status: 'trial' },
    });

    const res = await request(app)
      .get('/api/superadmin/courts/pending')
      .set('x-kourtly-auth', await superadminAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.map((court) => court._id)).toContain(String(pending._id));
    expect(res.body).toHaveLength(1);
    expect(res.body[0].registeredBy).toEqual({
      _id: String(registrant._id),
      email: 'registrant@court.com',
    });
  });

  test('PATCH /api/superadmin/courts/:id/approve starts a 14-day trial', async () => {
    const pending = await Court.create({
      name: 'Approval Court',
      slug: 'approval-court',
      adminEmail: 'approval@court.com',
      registrationStatus: 'pending',
      subscription: { status: 'pending', trialEnds: null },
    });

    const before = Date.now();
    const res = await request(app)
      .patch(`/api/superadmin/courts/${pending._id}/approve`)
      .set('x-kourtly-auth', await superadminAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body.registrationStatus).toBe('approved');
    expect(res.body.subscription.status).toBe('trial');
    const expectedMinimum = before + 14 * 24 * 60 * 60 * 1000;
    expect(new Date(res.body.trialEndsAt).getTime()).toBeGreaterThanOrEqual(expectedMinimum);
    expect(res.body.trialEndsAt).toBe(res.body.subscription.trialEnds);
  });

  test('PATCH /api/superadmin/courts/:id/reject stores the reason', async () => {
    const pending = await Court.create({
      name: 'Rejected Court',
      slug: 'rejected-court',
      adminEmail: 'rejected@court.com',
      registrationStatus: 'pending',
      subscription: { status: 'pending' },
    });

    const res = await request(app)
      .patch(`/api/superadmin/courts/${pending._id}/reject`)
      .set('x-kourtly-auth', await superadminAuthHeader())
      .send({ reason: 'Please provide a clearer location.' });

    expect(res.status).toBe(200);
    expect(res.body.registrationStatus).toBe('rejected');
    expect(res.body.rejectionReason).toBe('Please provide a clearer location.');
  });
});
