import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

// Use backend URL directly — auth.ts runs server-side, can't use relative /api/proxy
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      clientId:     process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      checks: ['state'],
    }),
  ],

  callbacks: {
    async signIn({ user }) {
      try {
        const res = await fetch(`${BACKEND_URL}/api/users/upsert`, {
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
        return true;
      }
    },

    async jwt({ token, trigger }) {
      if (token.email && (trigger === 'signIn' || !token.dbId)) {
        try {
          const res  = await fetch(`${BACKEND_URL}/api/users/by-email/${encodeURIComponent(token.email!)}`);
          const user = await res.json();
          token.role    = user.role    ?? 'user';
          token.dbId    = user._id;
          token.courtId = user.courtId ?? null;
        } catch {
          token.role = 'user';
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.role    = token.role    as string;
        session.user.dbId    = token.dbId    as string;
        session.user.courtId = token.courtId as string | null;
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
});