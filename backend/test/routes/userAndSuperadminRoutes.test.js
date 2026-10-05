import crypto from 'node:crypto';
import request from 'supertest';
import app from '../../src/app.js';
import Court from '../../src/models/Court.js';
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

  test('GET /api/superadmin/stats returns aggregate fields', async () => {
    await Court.create({
      name: 'SA Court',
      slug: 'sa-court',
      adminEmail: 'sa@court.com',
      subscription: { status: 'active', amount: 2000, plan: 'monthly' },
    });

    const res = await request(app)
      .get('/api/superadmin/stats')
      .set('x-kourtly-auth', await superadminAuthHeader());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('mrr');
    expect(res.body).toHaveProperty('arr');
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
