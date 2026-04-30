import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;

    if (pathname.startsWith("/admin")) {
      if (!token) {
        const signInUrl = new URL("/auth/signin", req.url);
        signInUrl.searchParams.set("callbackUrl", pathname);
        return NextResponse.redirect(signInUrl);
      }

      if (token.role !== "admin") {
        return NextResponse.redirect(new URL("/?error=unauthorized", req.url));
      }
    }

    if (pathname.startsWith("/superadmin")) {
      if (!token) {
        const signInUrl = new URL("/auth/signin", req.url);
        signInUrl.searchParams.set("callbackUrl", pathname);
        return NextResponse.redirect(signInUrl);
      }

      if (token.role !== "superadmin") {
        return NextResponse.redirect(new URL("/?error=unauthorized", req.url));
      }
    }

    const response = NextResponse.next();

    if (token?.courtId) {
      response.headers.set("x-court-id", token.courtId);
    }

    if (token?.role) {
      response.headers.set("x-user-role", token.role);
    }

    return response;
  },
  {
    callbacks: {
      authorized: () => true, // we handle auth manually
    },
  }
);

export const config = {
  matcher: ["/admin/:path*", "/auth/:path*", "/superadmin/:path*"],
};