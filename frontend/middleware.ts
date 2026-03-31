import { auth } from './auth'; 
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session      = req.auth;

  // ── Protect /admin routes ─────────────────────────────────────────────────
  if (pathname.startsWith('/admin')) {
    // Not signed in → redirect to sign-in
    if (!session) {
      const signInUrl = new URL('/auth/signin', req.url);
      signInUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(signInUrl);
    }

    // Signed in but not admin → redirect to home with error
    if (session.user?.role !== 'admin') {
      const homeUrl = new URL('/?error=unauthorized', req.url);
      return NextResponse.redirect(homeUrl);
    }
  }

  /**
   *  Protect /superadmin routes
   */
  if (pathname.startsWith('/superadmin')) {
    if (!session) {
      const signInUrl = new URL('/auth/signin', req.url);
      signInUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(signInUrl);
    }
    if (session.user?.role !== 'superadmin') {
      return NextResponse.redirect(new URL('/?error=unauthorized', req.url));
    }
  }

    // ── Forward court context to Express ─────────────────────────────────────
    const response = NextResponse.next();
    const courtId  = session?.user?.courtId;
    const role     = session?.user?.role;
  
    if (courtId) response.headers.set('x-court-id', courtId);
    if (role)    response.headers.set('x-user-role', role);

  return NextResponse.next();
});

export const config = {
  // Run middleware on admin routes and auth routes
  matcher: ['/admin/:path*', '/auth/:path*', '/superadmin/:path*'],
};