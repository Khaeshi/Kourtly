'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import Image from 'next/image';

interface Props {
  isOpen:  boolean;
  onClose: () => void;
  user:    { name: string; email: string; image: string };
}

const NAV = [
  { href: '/admin',             label: 'Dashboard',  exact: true },
  { href: '/admin/players',     label: 'Players' },
  { href: '/admin/queue',       label: 'Queue' },
  { href: '/admin/billing',     label: 'Billing' },
  { href: '/admin/items',       label: 'Items' },
  { href: '/admin/reservation', label: 'Reservation' },
  { href: '/admin/schedule',    label: 'Scheduling' },
  { href: '/admin/settings',    label: 'Settings' },
];

const SUPERADMIN_NAV = [
  { href: '/admin/superadmin', label: 'Super Admin' },
];

export default function AdminSidebar({ isOpen, onClose, user }: Props) {
  const pathname             = usePathname();
  const { data: session }    = useSession();
  const isSuperAdmin         = session?.user?.role === 'superadmin';
  const [signingOut, setSigningOut] = useState(false);

  // Court name for the sidebar brand
  const [courtName, setCourtName] = useState<string | null>(null);

  useEffect(() => {
    const courtId = session?.user?.courtId;
    if (!courtId) return;

    // Use the court name from token if already available (auth.ts stores it)
    if (session?.user?.court?.name) {
      setCourtName(session.user.court.name);
      return;
    }

    // Fallback: fetch from /api/proxy/court/me
    fetch('/api/proxy/court/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.name) setCourtName(data.name); })
      .catch(() => {});
  }, [session?.user?.courtId, session?.user?.court?.name]);

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut({ callbackUrl: '/' });
  };

  const renderNavItem = (item: { href: string; label: string; exact?: boolean }) => {
    const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
    return (
      <Link key={item.href} href={item.href} onClick={onClose}
        className={`sidebar-item ${active ? 'active' : ''}`}>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors duration-150 ${active ? 'bg-green-700' : 'bg-gray-300'}`} />
        {item.label}
      </Link>
    );
  };

  // Display name: court name > 'Admin Panel' for superadmin > 'My Court'
  const brandName = isSuperAdmin
    ? 'Admin Panel'
    : courtName ?? 'My Court';

  return (
    <aside className={`admin-sidebar-aside ${isOpen ? 'open' : ''}`}>

      {/* Brand */}
      <div className="px-5 py-5 pb-4 border-b border-gray-100">
        <Link href="/" className="no-underline flex items-center gap-2.5">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isSuperAdmin ? 'bg-purple-700' : 'bg-green-700'}`}>
            <div className="w-2.5 h-2.5 rounded-full bg-white opacity-90" />
          </div>
          <span className="font-bold text-sm text-gray-900 tracking-tight truncate max-w-[140px]" title={brandName}>
            {brandName}
          </span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="px-3 py-3 flex-1 flex flex-col gap-0.5">
        <p className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-400 px-3.5 mb-1">
          Management
        </p>
        {NAV.map(renderNavItem)}

        {isSuperAdmin && (
          <>
            <p className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-400 px-3.5 mt-4 mb-1">
              Platform
            </p>
            {SUPERADMIN_NAV.map(renderNavItem)}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-gray-100 flex flex-col gap-2">
        <div className="flex items-center gap-2.5 px-3.5 py-2">
          {user.image ? (
            <Image src={user.image} alt={user.name} width={26} height={26} className="rounded-full shrink-0" />
          ) : (
            <div className="w-[26px] h-[26px] rounded-full bg-green-50 border border-green-200 flex items-center justify-center shrink-0">
              <span className="text-[0.65rem] font-semibold text-green-700">
                {user.name?.[0]?.toUpperCase() ?? '?'}
              </span>
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-800 truncate leading-tight">{user.name || 'Admin'}</p>
            <p className="text-[0.62rem] text-gray-400 truncate leading-tight">{user.email}</p>
            {isSuperAdmin && (
              <p className="text-[0.58rem] font-semibold text-purple-500 uppercase tracking-wide leading-tight">
                Super Admin
              </p>
            )}
            {!isSuperAdmin && courtName && (
              <p className="text-[0.58rem] font-semibold text-green-600 uppercase tracking-wide leading-tight truncate">
                {courtName}
              </p>
            )}
          </div>
        </div>

        <button onClick={handleSignOut} disabled={signingOut}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs text-red-500 border border-red-100 bg-transparent cursor-pointer transition-colors hover:bg-red-50 disabled:opacity-50 w-full font-medium"
          style={{ fontFamily: 'inherit' }}>
          <span>↪</span>
          {signingOut ? 'Signing out...' : 'Sign Out'}
        </button>

        <Link href="/" className="flex items-center gap-2 px-3.5 py-2 rounded-lg no-underline text-gray-500 text-xs hover:bg-gray-100 transition-colors">
          ← View Site
        </Link>
      </div>
    </aside>
  );
}