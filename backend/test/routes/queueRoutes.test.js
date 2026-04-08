import request from 'supertest';
import app from '../../src/app.js';
import Court from '../../src/models/Court.js';
import Player from '../../src/models/Player.js';
import Match from '../../src/models/Match.js';

async function makeCourt() {
  return Court.create({
    name: 'Queue Court',
    slug: `queue-court-${Date.now()}`,
    adminEmail: 'queue@court.com',
    isActive: true,
    subscription: { status: 'active' },
    courtCount: 4,
  });
}

describe('queue routes', () => {
  test('POST /api/queue creates match and increments player matchCount', async () => {
    const court = await makeCourt();
    const players = await Player.create([
      { courtId: court._id, name: 'P1', level: 'A', gender: 'Male', age: 20 },
      { courtId: court._id, name: 'P2', level: 'B', gender: 'Male', age: 21 },
      { courtId: court._id, name: 'P3', level: 'C', gender: 'Female', age: 22 },
      { courtId: court._id, name: 'P4', level: 'D', gender: 'Female', age: 23 },
    ]);

    const res = await request(app)
      .post('/api/queue')
      .set('x-court-id', String(court._id))
      .send({
        team1: [String(players[0]._id), String(players[1]._id)],
        team2: [String(players[2]._id), String(players[3]._id)],
        matchType: 'XD',
        court: 1,
      });

    expect(res.status).toBe(201);
    const updated = await Player.find({ _id: { $in: players.map((p) => p._id) } }).lean();
    expect(updated.every((p) => p.matchCount === 1)).toBe(true);
  });

  test('GET /api/queue/history returns done matches only', async () => {
    const court = await makeCourt();
    await Match.create([
      { courtId: court._id, team1: [], team2: [], matchType: 'MD', court: 1, status: 'done' },
      { courtId: court._id, team1: [], team2: [], matchType: 'MD', court: 2, status: 'queued' },
    ]);

    const res = await request(app)
      .get('/api/queue/history')
      .set('x-court-id', String(court._id));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].status).toBe('done');
  });
});
