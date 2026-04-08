/**
 * @jest-environment node
 */
import { GET, POST } from '@/app/api/auth/[...nextauth]/route';
import { handlers } from '@/auth';

jest.mock('@/auth', () => ({
  handlers: {
    GET: jest.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    POST: jest.fn(async () => new Response(JSON.stringify({ ok: 'post' }), { status: 201 })),
  },
}));

describe('NextAuth route exports', () => {
  test('GET is wired from handlers', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test('POST is wired from handlers', async () => {
    const res = await POST();
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe('post');
  });

  test('calls handlers GET/POST', async () => {
    await GET();
    await POST();
    expect(handlers.GET).toHaveBeenCalledTimes(2);
    expect(handlers.POST).toHaveBeenCalledTimes(2);
  });
});

