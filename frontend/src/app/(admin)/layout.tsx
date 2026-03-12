import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import AdminLayoutClient from '../components/admin/AdminLayoutClient';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session)                      redirect('/auth/signin?callbackUrl=/admin');
  if (session.user.role !== 'admin') redirect('/?error=unauthorized');

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