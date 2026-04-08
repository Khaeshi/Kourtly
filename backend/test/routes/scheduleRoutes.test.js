import request from 'supertest';
import app from '../../src/app.js';
import Court from '../../src/models/Court.js';

describe('schedule routes', () => {
  test('GET /api/schedule/rules seeds defaults and returns 7 records', async () => {
    const court = await Court.create({
      name: 'Rules Court',
      slug: 'rules-court',
      adminEmail: 'rules@court.com',
      isActive: true,
      subscription: { status: 'active' },
      courtCount: 4,
    });

    const res = await request(app)
      .get('/api/schedule/rules')
      .set('x-court-id', String(court._id));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(7);
    expect(res.body[0]).toHaveProperty('dayName');
  });

  test('POST /api/schedule/blocks validates date for creation', async () => {
    const court = await Court.create({
      name: 'Blocks Court',
      slug: 'blocks-court',
      adminEmail: 'blocks@court.com',
      isActive: true,
      subscription: { status: 'active' },
      courtCount: 4,
    });

    const res = await request(app)
      .post('/api/schedule/blocks')
      .set('x-court-id', String(court._id))
      .send({ blockType: 'day' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/date is required/i);
  });

  test('GET /api/schedule/resolve validates date query', async () => {
    const court = await Court.create({
      name: 'Resolve Court',
      slug: 'resolve-court',
      adminEmail: 'resolve@court.com',
      isActive: true,
      subscription: { status: 'active' },
      courtCount: 4,
    });

    const res = await request(app)
      .get('/api/schedule/resolve')
      .set('x-court-id', String(court._id));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/date is required/i);
  });
});
