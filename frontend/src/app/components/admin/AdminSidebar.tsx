'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useState, useEffect, useRef, type MouseEvent, type CSSProperties } from 'react';
import {
  Users,
  ListOrdered,
  CreditCard,
  Package,
  CalendarClock,
  CalendarDays,
  ShieldUser,
  Settings,
  ClipboardCheck,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { ProfileMenu, initials } from '@/app/components/ui/ProfileMenu';
import { useCapabilities } from '@/lib/entitlements';
import { wipeOfflineData } from '@/lib/offlineCache';
import { proxyFetch } from '@/lib/api';

interface Props {
  isOpen: boolean;
  offline: boolean;
  onClose: () => void;
  user: { name: string; email: string; image: string };
  title: string;
  fsSupported: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

const NAV = [
  { href: '/admin', label: 'Dashboard', exact: true, icon: ShieldUser },
  { href: '/admin/players', label: 'Players', icon: Users, module: 'queue' as const },
  { href: '/admin/queue', label: 'Queue', icon: ListOrdered, module: 'queue' as const },
  { href: '/admin/billing', label: 'Billing', icon: CreditCard, module: 'item_tabs' as const },
  { href: '/admin/items', label: 'Items', icon: Package, module: 'item_tabs' as const },
  { href: '/admin/reservation', label: 'Reservation', icon: CalendarDays, module: 'booking' as const },
  { href: '/admin/schedule', label: 'Scheduling', icon: CalendarClock, module: 'booking' as const },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
  { href: '/admin/registration', label: 'Registration', icon: ClipboardCheck, statusOnly: true },
];
/**
 * REcheck this part
 
const SUPERADMIN_NAV = [
  { href: '/admin/superadmin', label: 'Super Admin' },
];
  */
export default function AdminSidebar({
  isOpen, offline, onClose, user, title, fsSupported, isFullscreen, onToggleFullscreen,
}: Props) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isSuperAdmin = session?.user?.role === 'superadmin';
  const capabilities = useCapabilities();
  const [signingOut, setSigningOut] = useState(false);

  const handleNavigation = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    onClose();
    if (offline || !navigator.onLine) {
      event.preventDefault();
      window.location.assign(href);
    }
  };

  // Court name + logo (API is source of truth; session carries logo after update())
  const [courtName, setCourtName] = useState<string | null>(null);
  const [courtLogoUrl, setCourtLogoUrl] = useState<string | null>(null);
  const [registrationStatus, setRegistrationStatus] = useState<string | null>(null);

  useEffect(() => {
    const courtId = session?.user?.courtId;

    if (!courtId) {
      setCourtName(null);
      setCourtLogoUrl(null);
      setRegistrationStatus(null);
      return;
    }

    if (session?.user?.court?.name) {
      setCourtName(session.user.court.name);
    }

    if (session?.user?.court?.logoUrl) {
      setCourtLogoUrl(session.user.court.logoUrl);
    }

    const loadCourt = async () => {
      try {
        const data = await proxyFetch<{
          name?: string;
          logoUrl?: string;
          registrationStatus?: string;
        }>('/court/me', undefined, { allowSnapshotFallback: false });
        if (data?.name) setCourtName(data.name);
        if (data?.logoUrl) setCourtLogoUrl(data.logoUrl);
        setRegistrationStatus(data?.registrationStatus ?? null);
      } catch (error) {
        console.error('Could not load court branding.', error);
      }
    };
    void loadCourt();
  }, [
    session?.user?.courtId,
    session?.user?.court?.name,
    session?.user?.court?.logoUrl,
    pathname,
  ]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await wipeOfflineData();
      await signOut({ callbackUrl: '/' });
    } catch (error) {
      console.error('Could not clear offline data before signing out.', error);
      setSigningOut(false);
      window.alert('Offline data could not be cleared. Please try signing out again.');
    }
  };

  // Display name: court name > 'Admin Panel' for superadmin > 'My Court'
  const brandName = isSuperAdmin
    ? 'Admin Panel'
    : courtName ?? 'My Court';

  const items = registrationStatus === null
    ? []
    : registrationStatus === 'approved'
      ? NAV.filter(item => !item.statusOnly && (!item.module || capabilities.modules[item.module]))
      : NAV.filter(item => item.statusOnly);
  const isActive = (item: typeof NAV[number]) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);
  const activeIndex = items.findIndex(isActive);
  const profileSubtitle = isSuperAdmin ? 'Super admin' : courtName ?? '';

  const logo = isSuperAdmin
    ? 'AP'
    : courtLogoUrl
      ? <Image src={courtLogoUrl} alt="" width={32} height={32} unoptimized />
      : initials(brandName);

  return (
    <>
      <aside
        id="ad-side"
        className={`ad-side${isOpen ? ' is-open' : ''}`}
        style={{ '--i': Math.max(activeIndex, 0) } as CSSProperties}
      >
        {/* Brand: logo always visible, full court name when the shell slides out */}
        <div className="ad-brand">
          <Link href="/" onClick={handleNavigation('/')}>
            <span className="ad-logo">{logo}</span>
            <span className="ad-lbl ad-brandname" title={brandName}>
              {brandName}
              {isSuperAdmin && <small className="ad-brandtag">SUPER ADMIN</small>}
            </span>
          </Link>
        </div>

        {/* Nav */}
        <nav className={`ad-nav${activeIndex < 0 ? ' no-active' : ''}`} aria-label="Admin">
          <span className="ad-mk" aria-hidden="true" />
          {items.map(item => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleNavigation(item.href)}
                aria-current={active ? 'page' : undefined}
                className={`ad-link${active ? ' active' : ''}`}
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
                <span className="ad-lbl">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <ProfileMenu
          variant="rail"
          user={user}
          subtitle={profileSubtitle}
          signingOut={signingOut}
          onSignOut={handleSignOut}
          onNavigate={handleNavigation}
        />
      </aside>

      {/* Phone top bar (hidden on desktop by CSS) */}
      <div className="ad-appbar">
        <div className="ad-appbar-id">
          <span className="ad-logo ad-logo-sm">{logo}</span>
          <span className="ad-appbar-text">
            <b title={brandName}>{brandName}</b>
            <small>{title}</small>
          </span>
        </div>
        <div className="ad-appbar-actions">
          {fsSupported && (
            <button
              type="button"
              className="ad-iconbtn"
              onClick={onToggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          )}
          <ProfileMenu
            variant="bar"
            user={user}
            subtitle={profileSubtitle}
            signingOut={signingOut}
            onSignOut={handleSignOut}
            onNavigate={handleNavigation}
          />
        </div>
      </div>
    </>
  );
}
