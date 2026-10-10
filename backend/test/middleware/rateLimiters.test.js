import express from 'express';
import request from 'supertest';
import { createPublicCostlyLimiter } from '../../src/middleware/rateLimiters.js';

describe('public costly rate limiter', () => {
  test('returns 429 after the configured maximum is reached', async () => {
    const app = express();
    app.post('/', createPublicCostlyLimiter({ windowMs: 60_000, max: 1 }), (_req, res) => {
      res.sendStatus(204);
    });

    const first = await request(app).post('/');
    const second = await request(app).post('/');

    expect(first.status).toBe(204);
    expect(second.status).toBe(429);
  });
});
