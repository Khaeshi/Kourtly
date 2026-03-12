import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId:     process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],

  callbacks: {
    // Upsert user in MongoDB on every sign-in
    async signIn({ user }) {
      try {
        await fetch(`${BASE}/api/users/upsert`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email:    user.email,
            name:     user.name,
            image:    user.image,
            provider: 'google',
          }),
        });
        return true;
      } catch {
        return false;
      }
    },

    // Fetch role from backend and attach to JWT
    async jwt({ token, trigger }) {
      if (token.email && (trigger === 'signIn' || trigger === 'update' || !token.role)) {
        try {
          const res  = await fetch(`${BASE}/api/users/by-email/${encodeURIComponent(token.email)}`);
          const user = await res.json();
          token.role = user.role ?? 'user';
          token.dbId = user._id;
        } catch {
          token.role = 'user';
        }
      }
      return token;
    },

    // Expose role + dbId to client session
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as string;
        session.user.dbId = token.dbId as string;
      }
      return session;
    },

    // Post-signin redirect: admins → /admin, everyone else → /
    async redirect({ url, baseUrl }) {
      // If it was explicitly going somewhere (e.g. callbackUrl=/admin), honour it
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