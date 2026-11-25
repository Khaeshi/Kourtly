/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/pricing/tiers/route';

describe('GET /api/pricing/tiers proxy', () => {
  test('returns the backend prices with no-store caching', async () => {
    const data = { tiers: [{ tier: 'basic', label: 'Basic', price: 799 }] };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => data,
    } as Response);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual(data);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/pricing\/tiers$/),
      { cache: 'no-store' },
    );
  });

  test('returns failure when the backend cannot be reached', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('offline'));

    const response = await GET();

    expect(response.status).toBe(502);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ error: 'Pricing is unavailable' });
  });
});
