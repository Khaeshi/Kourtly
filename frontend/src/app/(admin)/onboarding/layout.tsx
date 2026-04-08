import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect('/auth/signin');
  if (session.user.role !== 'admin') redirect('/admin');

  // If admin already has a courtId, skip the wizard and go to dashboard.
  if (session.user.courtId) {
    redirect('/admin');
  }

  return <>{children}</>;
}