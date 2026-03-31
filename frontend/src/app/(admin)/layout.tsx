import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import AdminLayoutClient from '../components/admin/AdminLayoutClient';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session) redirect('/auth/signin?callbackUrl=/admin');
  
  // Allow both admin and superadmin
  if (session.user.role !== 'admin' && session.user.role !== 'superadmin') {
    redirect('/?error=unauthorized');
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