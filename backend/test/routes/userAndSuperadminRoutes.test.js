import request from 'supertest';
import app from '../../src/app.js';
import Court from '../../src/models/Court.js';
import User from '../../src/models/User.js';

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
      .set('x-user-role', 'superadmin');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('mrr');
    expect(res.body).toHaveProperty('arr');
  });

  test('POST /api/superadmin/courts validates required fields', async () => {
    const res = await request(app)
      .post('/api/superadmin/courts')
      .set('x-user-role', 'superadmin')
      .send({ name: 'Missing fields' });

    expect(res.status).toBe(400);
  });

  test('POST /api/superadmin/courts creates court and links admin user', async () => {
    const res = await request(app)
      .post('/api/superadmin/courts')
      .set('x-user-role', 'superadmin')
      .send({
        name: 'Created by SA',
        slug: 'created-by-sa',
        adminEmail: 'new-admin@court.com',
      });

    expect(res.status).toBe(201);
    const user = await User.findOne({ email: 'new-admin@court.com' }).lean();
    expect(user).toBeTruthy();
    expect(user.role).toBe('admin');
  });
});
