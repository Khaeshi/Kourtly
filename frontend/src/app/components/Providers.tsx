'use client';
import { SessionProvider } from 'next-auth/react';
import PWAInit from './PWAInit';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <PWAInit />
      {children}
    </SessionProvider>
  );
}