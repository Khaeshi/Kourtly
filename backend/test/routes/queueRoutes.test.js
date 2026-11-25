import request from 'supertest';
import app from '../../src/app.js';
import Court from '../../src/models/Court.js';
import Player from '../../src/models/Player.js';
import Match from '../../src/models/Match.js';

async function makeCourt() {
  return Court.create({
    name: 'Queue Court',
    slug: `queue-court-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    adminEmail: 'queue@court.com',
    isActive: true,
    registrationStatus: 'approved',
    subscription: { status: 'active', tier: 'standard' },
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
        courtId: '000000000000000000000001',
        status: 'done',
      });

    expect(res.status).toBe(201);
    expect(res.body.courtId).toBe(String(court._id));
    expect(res.body.status).toBe('queued');
    const updated = await Player.find({ _id: { $in: players.map((p) => p._id) } }).lean();
    expect(updated.every((p) => p.matchCount === 1)).toBe(true);
  });

  test('POST /api/queue rejects a foreign player without returning foreign data', async () => {
    const court = await makeCourt();
    const otherCourt = await makeCourt();
    const players = await Player.create([
      { courtId: court._id, name: 'Local 1', level: 'A', gender: 'Male', age: 20 },
      { courtId: court._id, name: 'Local 2', level: 'B', gender: 'Male', age: 21 },
      { courtId: court._id, name: 'Local 3', level: 'C', gender: 'Female', age: 22 },
      { courtId: otherCourt._id, name: 'Foreign player secret', level: 'D', gender: 'Female', age: 23 },
    ]);

    const response = await request(app)
      .post('/api/queue')
      .set('x-court-id', String(court._id))
      .send({
        team1: [String(players[0]._id), String(players[1]._id)],
        team2: [String(players[2]._id), String(players[3]._id)],
        matchType: 'XD',
        court: 1,
        courtId: String(otherCourt._id),
      });

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).not.toContain('Foreign player secret');
    await expect(Match.countDocuments({ courtId: court._id })).resolves.toBe(0);
    const updated = await Player.find({ _id: { $in: players.map(player => player._id) } }).lean();
    expect(updated.every(player => player.matchCount === 0)).toBe(true);
  });

  test('PATCH /api/queue/:id rejects foreign players without returning foreign data', async () => {
    const court = await makeCourt();
    const otherCourt = await makeCourt();
    const players = await Player.create([
      { courtId: court._id, name: 'Local 1', level: 'A', gender: 'Male', age: 20 },
      { courtId: court._id, name: 'Local 2', level: 'B', gender: 'Male', age: 21 },
      { courtId: court._id, name: 'Local 3', level: 'C', gender: 'Female', age: 22 },
      { courtId: court._id, name: 'Local 4', level: 'D', gender: 'Female', age: 23 },
      { courtId: otherCourt._id, name: 'Foreign player secret', level: 'D', gender: 'Female', age: 24 },
    ]);
    const match = await Match.create({
      courtId: court._id,
      team1: [players[0]._id, players[1]._id],
      team2: [players[2]._id, players[3]._id],
      matchType: 'XD',
      court: 1,
    });

    const response = await request(app)
      .patch(`/api/queue/${match._id}`)
      .set('x-court-id', String(court._id))
      .send({
        team1: [String(players[0]._id), String(players[4]._id)],
        courtId: String(otherCourt._id),
      });

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).not.toContain('Foreign player secret');
    const unchanged = await Match.findById(match._id).lean();
    expect(unchanged.team1.map(String)).toEqual([String(players[0]._id), String(players[1]._id)]);
    expect(String(unchanged.courtId)).toBe(String(court._id));
  });

  test('PATCH /api/queue/:id ignores tenant and status fields', async () => {
    const court = await makeCourt();
    const otherCourt = await makeCourt();
    const match = await Match.create({
      courtId: court._id,
      team1: [],
      team2: [],
      matchType: 'MD',
      court: 1,
      status: 'queued',
    });

    const response = await request(app)
      .patch(`/api/queue/${match._id}`)
      .set('x-court-id', String(court._id))
      .send({ court: 2, courtId: String(otherCourt._id), status: 'done' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      courtId: String(court._id),
      court: 2,
      status: 'queued',
    });
  });

  test.each([
    [{ $set: { court: 2 } }],
    [{ 'court.$set': 2 }],
    [{ court: '2' }],
    [{ team1: [{ $oid: 'invalid' }, '012345678901234567890123'] }],
  ])('PATCH /api/queue/:id rejects operators, dotted paths, and invalid types: %o', async body => {
    const court = await makeCourt();
    const players = await Player.create([
      { courtId: court._id, name: 'P1', level: 'A', gender: 'Male', age: 20 },
      { courtId: court._id, name: 'P2', level: 'B', gender: 'Male', age: 21 },
      { courtId: court._id, name: 'P3', level: 'C', gender: 'Female', age: 22 },
      { courtId: court._id, name: 'P4', level: 'D', gender: 'Female', age: 23 },
    ]);
    const match = await Match.create({
      courtId: court._id,
      team1: [players[0]._id, players[1]._id],
      team2: [players[2]._id, players[3]._id],
      matchType: 'XD',
      court: 1,
    });

    const response = await request(app)
      .patch(`/api/queue/${match._id}`)
      .set('x-court-id', String(court._id))
      .send(body);

    expect(response.status).toBe(400);
    await expect(Match.findById(match._id).lean()).resolves.toMatchObject({ court: 1 });
  });

  test('queue status transitions are scoped and idempotent', async () => {
    const court = await makeCourt();
    const otherCourt = await makeCourt();
    const players = await Player.create([
      { courtId: court._id, name: 'P1', level: 'A', gender: 'Male', age: 20 },
      { courtId: court._id, name: 'P2', level: 'B', gender: 'Male', age: 21 },
      { courtId: court._id, name: 'P3', level: 'C', gender: 'Female', age: 22 },
      { courtId: court._id, name: 'P4', level: 'D', gender: 'Female', age: 23 },
    ]);
    const match = await Match.create({
      courtId: court._id,
      team1: [players[0]._id, players[1]._id],
      team2: [players[2]._id, players[3]._id],
      matchType: 'XD',
      court: 1,
      status: 'queued',
    });

    const start = () => request(app)
      .post(`/api/queue/${match._id}/status`)
      .set('x-court-id', String(court._id))
      .send({ status: 'playing' });
    const started = await start();
    expect(started.status).toBe(200);
    expect(started.body.status).toBe('playing');

    const repeatedStart = await start();
    expect(repeatedStart.status).toBe(200);
    expect(repeatedStart.body.status).toBe('playing');
    expect(repeatedStart.body.updatedAt).toBe(started.body.updatedAt);

    const done = await request(app)
      .post(`/api/queue/${match._id}/status`)
      .set('x-court-id', String(court._id))
      .send({ status: 'done' });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('done');

    const outOfOrder = await request(app)
      .post(`/api/queue/${match._id}/status`)
      .set('x-court-id', String(otherCourt._id))
      .send({ status: 'playing' });
    expect(outOfOrder.status).toBe(404);
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
