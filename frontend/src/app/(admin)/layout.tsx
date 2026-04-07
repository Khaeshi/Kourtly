// frontend/src/app/(admin)/admin/layout.tsx
import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import AdminLayoutClient from '../components/admin/AdminLayoutClient';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session) redirect('/auth/signin?callbackUrl=/admin');
  if (session.user.role !== 'admin' && session.user.role !== 'superadmin') {
    redirect('/?error=unauthorized');
  }

  // Check onboarding for admins
  if (session.user.role === 'admin' && session.user.courtId) {
    const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    try {
      const res   = await fetch(`${BACKEND_URL}/api/court/me`, {
        headers: {
          'x-court-id':  session.user.courtId,
          'x-user-role': session.user.role,
        },
      });
      const court = await res.json();
      if (!court.onboardingComplete) redirect('/admin/onboarding');
    } catch {}
  }

  return (
    <AdminLayoutClient user={{
      name:  session.user.name  ?? '',
      email: session.user.email ?? '',
      image: session.user.image ?? '',
    }}>
      {children}
    </AdminLayoutClient>
  );
}