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

  return NextResponse.next();
});

export const config = {
  // Run middleware on admin routes and auth routes
  matcher: ['/admin/:path*', '/auth/:path*'],
};