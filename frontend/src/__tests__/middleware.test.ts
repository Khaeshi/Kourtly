/**
 * @jest-environment node
 */
import { NextResponse } from 'next/server';

// Mock NextAuth `auth()` wrapper so we can execute the middleware callback directly.
jest.mock('../../auth', () => ({
  auth: (cb: any) => cb,
}));

import middleware from '../../middleware';

type Session = { user?: { role?: string; courtId?: string; email?: string } } | null;

function makeReq(pathname: string, session: Session) {
  const url = `http://localhost${pathname}`;
  return {
    url,
    nextUrl: new URL(url) as any,
    auth: session,
  } as any;
}

describe('middleware', () => {
  test('redirects unauthenticated users from /admin', async () => {
    const res = await middleware(makeReq('/admin/players', null));

    expect(res).toBeInstanceOf(NextResponse);
    const location = res.headers.get('location')!;
    const url = new URL(location);
    expect(url.pathname).toBe('/auth/signin');
    expect(url.searchParams.get('callbackUrl')).toBe('/admin/players');
  });

  test('redirects non-admin users from /admin', async () => {
    const session = { user: { role: 'user', courtId: 'c1', email: 'u@test.com' } };
    const res = await middleware(makeReq('/admin/players', session));

    expect(res).toBeInstanceOf(NextResponse);
    expect(res.headers.get('location')).toBe('http://localhost/?error=unauthorized');
  });

  test('protects /superadmin (unauthenticated)', async () => {
    const res = await middleware(makeReq('/superadmin/users', null));

    expect(res).toBeInstanceOf(NextResponse);
    const location = res.headers.get('location')!;
    const url = new URL(location);
    expect(url.pathname).toBe('/auth/signin');
    expect(url.searchParams.get('callbackUrl')).toBe('/superadmin/users');
  });

  test('sets court headers and forwards when admin is signed in', async () => {
    const session = { user: { role: 'admin', courtId: 'court-123', email: 'a@test.com' } };
    const res = await middleware(makeReq('/admin/queue', session));

    expect(res).toBeInstanceOf(NextResponse);
    expect(res.headers.get('x-court-id')).toBe('court-123');
    expect(res.headers.get('x-user-role')).toBe('admin');
  });
});

