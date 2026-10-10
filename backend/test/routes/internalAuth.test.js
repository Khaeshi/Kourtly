import request from 'supertest';
import app from '../../src/app.js';

describe('internal authentication boundary', () => {
  test('rejects forged tenant and role headers outside the test compatibility mode', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousTestAuthBypass = process.env.ALLOW_TEST_AUTH_BYPASS;
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_TEST_AUTH_BYPASS = 'false';

    try {
      const tenantResponse = await request(app)
        .get('/api/reservations')
        .set('x-court-id', '507f1f77bcf86cd799439011')
        .set('x-user-role', 'admin');

      const superadminResponse = await request(app)
        .get('/api/superadmin/courts')
        .set('x-user-role', 'superadmin');

      expect(tenantResponse.status).toBe(401);
      expect(superadminResponse.status).toBe(403);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      if (previousTestAuthBypass === undefined) delete process.env.ALLOW_TEST_AUTH_BYPASS;
      else process.env.ALLOW_TEST_AUTH_BYPASS = previousTestAuthBypass;
    }
  });
});