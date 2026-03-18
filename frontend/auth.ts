import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { API_BASE } from '@/lib/config'

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId:     process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      checks: ['state'], // ← disables PKCE, uses state only (works without DB adapter)
    }),
  ],

  callbacks: {
    async signIn({ user }) {
      try {
        const res = await fetch(`${API_BASE}/api/users/upsert`, {
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
      if (token.email && (trigger === 'signIn' || trigger === 'update' || !token.role)) {
        try {
          const res  = await fetch(`${API_BASE}/api/users/by-email/${encodeURIComponent(token.email!)}`);
          const user = await res.json();
          token.role = user.role ?? 'user';
          token.dbId = user._id;
        } catch {
          token.role = 'user';
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as string;
        session.user.dbId = token.dbId as string;
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

  pages: {
    signIn: '/auth/signin',
  },

  session: { strategy: 'jwt' },
});