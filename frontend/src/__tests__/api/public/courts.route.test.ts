/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/public/courts/[...path]/route';

describe('GET /api/public/courts route', () => {
  test('returns backend response payload when fetch succeeds', async () => {
    const mockData = [{ slug: 'test-court' }];
      global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(mockData),
    } as Response);

    const req = new NextRequest('http://localhost:3000/api/public/courts');
    const res = await GET(req, { params: Promise.resolve({ path: [] }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(mockData);
  });

  test('returns empty array fallback when fetch throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    const req = new NextRequest('http://localhost:3000/api/public/courts');
    const res = await GET(req, { params: Promise.resolve({ path: [] }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });
});