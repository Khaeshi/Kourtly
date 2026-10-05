'use client';

import { SessionProvider } from 'next-auth/react';
import type { Session } from 'next-auth';

export default function AdminSessionProvider({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session;
}) {
  return (
    <SessionProvider session={session} refetchOnWindowFocus={false} refetchInterval={0}>
      {children}
    </SessionProvider>
  );
}
