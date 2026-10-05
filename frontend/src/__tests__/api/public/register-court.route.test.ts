/**
 * @jest-environment node
 */
import { POST } from '@/app/api/public/register-court/route';
import { auth } from '@/auth';
import { createInternalAssertion } from '@/lib/internalAuthClient';

jest.mock('@/auth', () => ({ auth: jest.fn() }));
jest.mock('@/lib/internalAuthClient', () => ({ createInternalAssertion: jest.fn(() => 'signed-assertion') }));

const mockedAuth = auth as jest.MockedFunction<typeof auth>;

describe('POST /api/public/register-court route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.mockResolvedValue({ user: { email: 'admin@court.com' } } as never);
  });

  test('passes payload through to backend and returns backend status', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 201,
      json: async () => ({ success: true, slug: 'new-court' }),
    } as Response);

    const req = new Request('http://localhost:3000/api/public/register-court', {
      method: 'POST',
      body: JSON.stringify({ name: 'New Court', slug: 'new-court', adminEmail: 'admin@court.com' }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req as any);
    const body = await res.json();

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:5000/api/register-court',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-kourtly-auth': 'signed-assertion',
        },
      })
    );
    expect(createInternalAssertion).toHaveBeenCalledWith({ email: 'admin@court.com' });
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
  });

  test('returns 500 fallback when request fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('down'));

    const req = new Request('http://localhost:3000/api/public/register-court', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req as any);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('Registration failed');
  });

  test('requires a signed-in session', async () => {
    mockedAuth.mockResolvedValue(null as never);
    const req = new Request('http://localhost:3000/api/public/register-court', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });
});
