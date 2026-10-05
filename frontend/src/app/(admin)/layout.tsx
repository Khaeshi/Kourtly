// frontend/src/app/(admin)/admin/layout.tsx
import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import AdminLayoutClient from '../components/admin/AdminLayoutClient';
import AdminSessionProvider from '../components/admin/AdminSessionProvider';

const MAX_SEEDED_SESSION_AGE_MS = 24 * 60 * 60 * 1000;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session) redirect('/auth/signin?callbackUrl=/admin');
  if (session.user.role !== 'admin' && session.user.role !== 'superadmin') {
    redirect('/?error=unauthorized');
  }
  const existingExpiry = Date.parse(session.expires);
  const seededSession = {
    ...session,
    expires: new Date(Math.min(
      Number.isFinite(existingExpiry) ? existingExpiry : Date.now() + MAX_SEEDED_SESSION_AGE_MS,
      Date.now() + MAX_SEEDED_SESSION_AGE_MS
    )).toISOString(),
  };
  const buildId = process.env.NODE_ENV === 'development'
    ? 'development'
    : (await readFile(join(process.cwd(), '.next', 'BUILD_ID'), 'utf8')).trim();

  return (
    <AdminSessionProvider session={seededSession}>
      <AdminLayoutClient
        buildId={buildId}
        user={{
          name:  session.user.name  ?? '',
          email: session.user.email ?? '',
          image: session.user.image ?? '',
        }}
      >
        {children}
      </AdminLayoutClient>
    </AdminSessionProvider>
  );
}