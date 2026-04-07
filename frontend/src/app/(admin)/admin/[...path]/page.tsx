// Redirect to onboarding if no courtId
import { redirect } from 'next/navigation';
import { auth } from '@/auth';

export default async function AdminLayout({ children, params }: any) {
  const session = await auth();
  
  if (!session?.user) redirect('/auth/signin');
  
  // CHECK: No courtId → onboarding
  if (!session.user.courtId) {
    redirect('/admin/onboarding');
  }
  
  // Has courtId → show dashboard
  return <>{children}</>;
}