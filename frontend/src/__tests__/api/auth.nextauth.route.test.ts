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
  test('exports GET and POST handlers', () => {
    expect(typeof GET).toBe('function');
    expect(typeof POST).toBe('function');
  });
});

