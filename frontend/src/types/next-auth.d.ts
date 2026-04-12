import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: string;
      dbId: string;
      courtId: string | null;
      court?: {
        name: string;
        slug?: string;
        logoUrl?: string;
      } | null;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role: string;
    dbId: string;
    courtId: string | null;
    court?: {
      name: string;
      slug?: string;
      logoUrl?: string;
    } | null;
  }
}