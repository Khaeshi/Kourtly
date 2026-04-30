import NextAuth from 'next-auth';
import type { NextAuthOptions } from 'next-auth';
import { getServerSession } from 'next-auth/next';
import Google from 'next-auth/providers/google';

const BASE = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  providers: [
    Google({
      clientId:     process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      checks: ['state'],
      authorization: { params: { prompt: 'select_account' } },
    }),
  ],

  callbacks: {
    // 1. Upsert user on every sign-in
    async signIn({ user }) {
      try {
        const res = await fetch(`${BASE}/api/users/upsert`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email:    user.email,
            name:     user.name,
            image:    user.image,
            provider: 'google',
          }),
        });
        if (!res.ok) console.error('Upsert failed:', await res.text());
        return true;
      } catch (err) {
        console.error('signIn callback error:', err);
        return true; // never block sign-in
      }
    },

    // 2. Enrich JWT with role, courtId, and court name
    async jwt({ token, trigger }) {
      const shouldRefresh =
        trigger === 'signIn' ||
        trigger === 'update' ||
        !token.role;

      if (token.email && shouldRefresh) {
        try {
          const res  = await fetch(`${BASE}/api/users/by-email/${encodeURIComponent(token.email!)}`);
          const user = await res.json();

          token.role    = user.role    ?? 'user';
          token.dbId    = user._id     ?? '';
          token.courtId = user.courtId ?? null;

          // Fetch court name if user has a courtId
          if (user.courtId) {
            try {
              const courtRes = await fetch(`${BASE}/api/public/courts/id/${user.courtId}`);
              if (courtRes.ok) {
                const court = await courtRes.json();
                token.court = {
                  name: court.name,
                  slug: court.slug,
                  logoUrl: court.logoUrl || '',
                };
              }
            } catch {
              token.court = null;
            }
          } else {
            token.court = null;
          }
        } catch {
          token.role    = 'user';
          token.courtId = null;
          token.court   = null;
        }
      }
      return token;
    },

    // 3. Expose everything on the session object
    async session({ session, token }) {
      if (session.user) {
        session.user.role    = token.role    as string;
        session.user.dbId    = token.dbId    as string;
        session.user.courtId = token.courtId as string | null;
        session.user.court   = token.court   as { name: string; slug?: string } | null;
      }
      return session;
    },

    async redirect({ url, baseUrl }) {
      if (url.startsWith(baseUrl) || url.startsWith('/')) {
        return url.startsWith(baseUrl) ? url : `${baseUrl}${url}`;
      }
      return baseUrl;
    },
  },

  pages: { signIn: '/auth/signin' },
  session: { strategy: 'jwt' },
};

export async function auth() {
  return getServerSession(authOptions);
}