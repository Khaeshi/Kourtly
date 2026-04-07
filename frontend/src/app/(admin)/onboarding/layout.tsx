import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect('/auth/signin');
  if (session.user.role !== 'admin') redirect('/admin');

  // Check if already onboarded — skip wizard
  if (session.user.courtId) {
    const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    try {
      const res   = await fetch(`${BACKEND_URL}/api/court/me`, {
        headers: {
          'x-court-id':  session.user.courtId,
          'x-user-role': session.user.role,
        },
      });
      const court = await res.json();
      if (court.onboardingComplete) redirect('/admin');
    } catch {}
  }

  return <>{children}</>;
}