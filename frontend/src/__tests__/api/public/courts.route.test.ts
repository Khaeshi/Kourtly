/**
 * @jest-environment node
 */
import { GET } from '@/app/api/public/courts/[...path]/route';

describe('GET /api/public/courts route', () => {
  test('returns backend response payload when fetch succeeds', async () => {
    const mockData = [{ slug: 'test-court' }];
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData,
    } as Response);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(mockData);
  });

  test('returns empty array fallback when fetch throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([]);
  });
});

