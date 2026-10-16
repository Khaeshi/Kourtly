/**
 * @jest-environment node
 */
import { NextResponse } from 'next/server';

// Run the inner middleware directly: withAuth normally reads the token from the cookie.
jest.mock('next-auth/middleware', () => ({
  withAuth: (handler: any) => handler,
}));

import middleware from '../../middleware';

type Token = { role?: string; courtId?: string; email?: string } | null;

function makeReq(pathname: string, token: Token) {
  const url = `http://localhost${pathname}`;
  return {
    url,
    nextUrl: new URL(url) as any,
    nextauth: { token },
  } as any;
}

describe('middleware', () => {
  test('redirects unauthenticated users from /admin', async () => {
    const res = await (middleware as any)(makeReq('/admin/players', null));

    expect(res).toBeInstanceOf(NextResponse);
    const url = new URL(res.headers.get('location')!);
    expect(url.pathname).toBe('/auth/signin');
    expect(url.searchParams.get('callbackUrl')).toBe('/admin/players');
  });

  test('redirects non-admin users from /admin', async () => {
    const token = { role: 'user', courtId: 'c1', email: 'u@test.com' };
    const res = await (middleware as any)(makeReq('/admin/players', token));

    expect(res).toBeInstanceOf(NextResponse);
    expect(res.headers.get('location')).toBe('http://localhost/?error=unauthorized');
  });

  test('protects /superadmin (unauthenticated)', async () => {
    const res = await (middleware as any)(makeReq('/superadmin/users', null));

    expect(res).toBeInstanceOf(NextResponse);
    const url = new URL(res.headers.get('location')!);
    expect(url.pathname).toBe('/auth/signin');
    expect(url.searchParams.get('callbackUrl')).toBe('/superadmin/users');
  });

  test('redirects an admin who is not a superadmin from /superadmin', async () => {
    const token = { role: 'admin', courtId: 'c1', email: 'a@test.com' };
    const res = await (middleware as any)(makeReq('/superadmin/users', token));

    expect(res.headers.get('location')).toBe('http://localhost/?error=unauthorized');
  });

  test('sets court headers and forwards when admin is signed in', async () => {
    const token = { role: 'admin', courtId: 'court-123', email: 'a@test.com' };
    const res = await (middleware as any)(makeReq('/admin/queue', token));

    expect(res).toBeInstanceOf(NextResponse);
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-court-id')).toBe('court-123');
    expect(res.headers.get('x-user-role')).toBe('admin');
  });
});