import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import SuperAdminLayoutClient from '@/app/components/superadmin/SuperAdminLayoutClient';

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session)                           redirect('/auth/signin?callbackUrl=/superadmin');
  if (session.user.role !== 'superadmin') redirect('/?error=unauthorized');

  return (
    <SuperAdminLayoutClient user={{
      name:  session.user.name  ?? '',
      email: session.user.email ?? '',
      image: session.user.image ?? '',
    }}>
      {children}
    </SuperAdminLayoutClient>
  );
}