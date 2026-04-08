/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { GET, POST, DELETE } from '@/app/api/proxy/[...path]/route';
import { auth } from '@/auth';

jest.mock('@/auth', () => ({
  auth: jest.fn(),
}));

const mockedAuth = auth as jest.MockedFunction<typeof auth>;

describe('proxy route handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 401 when session is missing', async () => {
    mockedAuth.mockResolvedValue(null as never);

    const req = new NextRequest('http://localhost:3000/api/proxy/players');
    const res = await GET(req, { params: Promise.resolve({ path: ['players'] }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  test('forwards GET with tenant headers and query string', async () => {
    mockedAuth.mockResolvedValue({
      user: { courtId: 'court123', role: 'admin', email: 'admin@test.com' },
    } as never);

    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      json: async () => [{ id: 1 }],
    } as Response);

    const req = new NextRequest('http://localhost:3000/api/proxy/players?status=active');
    const res = await GET(req, { params: Promise.resolve({ path: ['players'] }) });
    const body = await res.json();

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:5000/api/players?status=active',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'x-court-id': 'court123',
          'x-user-role': 'admin',
          'x-user-email': 'admin@test.com',
        }),
      })
    );
    expect(res.status).toBe(200);
    expect(body).toEqual([{ id: 1 }]);
  });

  test('forwards POST body and handles DELETE without body', async () => {
    mockedAuth.mockResolvedValue({
      user: { courtId: 'court123', role: 'admin', email: 'admin@test.com' },
    } as never);

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        status: 201,
        json: async () => ({ ok: true }),
      } as Response)
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ deleted: true }),
      } as Response);

    const postReq = new NextRequest('http://localhost:3000/api/proxy/items', {
      method: 'POST',
      body: JSON.stringify({ name: 'Shuttle' }),
      headers: { 'content-type': 'application/json' },
    });
    const postRes = await POST(postReq, { params: Promise.resolve({ path: ['items'] }) });
    expect(postRes.status).toBe(201);

    const postCall = (global.fetch as jest.Mock).mock.calls[0];
    expect(postCall[1].method).toBe('POST');
    expect(postCall[1].body).toBe(JSON.stringify({ name: 'Shuttle' }));

    const delReq = new NextRequest('http://localhost:3000/api/proxy/items/1', { method: 'DELETE' });
    const delRes = await DELETE(delReq, { params: Promise.resolve({ path: ['items', '1'] }) });
    expect(delRes.status).toBe(200);

    const delCall = (global.fetch as jest.Mock).mock.calls[1];
    expect(delCall[1].method).toBe('DELETE');
    expect(delCall[1].body).toBeUndefined();
  });
});

