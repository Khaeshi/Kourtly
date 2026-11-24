'use client';

import { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Toaster } from 'sileo';
import { APP_NAME } from '@/lib/config';
import {
  LayoutDashboard,
  Users,
  ListOrdered,
  ClipboardCheck,
  CircleDollarSign,
  Menu,
  X,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { ProfileMenu } from '@/app/components/ui/ProfileMenu';

interface Props {
  children: React.ReactNode;
  user: {
    name: string;
    email: string;
    image: string;
  };
}

const NAV = [
  {
    href: '/superadmin',
    label: 'Dashboard',
    exact: true,
    icon: LayoutDashboard,
  },
  {
    href: '/superadmin/courts',
    label: 'Courts',
    icon: ListOrdered,
  },
  {
    href: '/superadmin/pending-courts',
    label: 'Pending Courts',
    icon: ClipboardCheck,
  },
  {
    href: '/superadmin/pricing',
    label: 'Tier Pricing',
    icon: CircleDollarSign,
  },
  {
    href: '/users',
    label: 'Users',
    icon: Users,
  },
];

export default function SuperAdminLayoutClient({ children, user }: Props) {
  const pathname = usePathname();
  const shellRef = useRef<HTMLElement>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fsSupported, setFsSupported] = useState(false);

  /* --------------------------------
     Fullscreen support
  -------------------------------- */
  useEffect(() => {
    setFsSupported(
      typeof document !== 'undefined' &&
        !!document.documentElement.requestFullscreen
    );
  }, []);

  /* --------------------------------
     Track fullscreen state
  -------------------------------- */
  useEffect(() => {
    const handler = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handler);

    return () => {
      document.removeEventListener('fullscreenchange', handler);
    };
  }, []);

  /* --------------------------------
     After navigation: close the phone menu, scroll the shell to the top,
     and drop focus from the rail so it slides back
  -------------------------------- */
  useEffect(() => {
    setSidebarOpen(false);
    shellRef.current?.scrollTo({ top: 0 });
    const active = document.activeElement as HTMLElement | null;
    if (active?.closest?.('.ad-side')) active.blur();
  }, [pathname]);

  /* Escape closes the phone menu */
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  /* Fullscreen toggle */
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(console.warn);
    } else {
      document.exitFullscreen().catch(console.warn);
    }
  }, []);

  /* --------------------------------
     Sign out
  -------------------------------- */
  const handleSignOut = async () => {
    setSigningOut(true);

    await signOut({
      callbackUrl: '/',
    });
  };

  const isActive = (item: typeof NAV[number]) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);
  const activeIndex = NAV.findIndex(isActive);
  const title = activeIndex >= 0 ? NAV[activeIndex].label : 'Super Admin';

  return (
    <>
      {/* =================================
          TOASTER
      ================================= */}
      <Toaster
        position="top-right"
        options={{
          fill: '#171717',
          styles: {
            title: 'text-white!',
            description: 'text-white/75!',
            badge: 'bg-white/10!',
          },
        }}
      />

      <div className="ad-app" data-nav-open={sidebarOpen ? 'true' : 'false'}>
        {/* =================================
            PINE LAYER: rail on desktop, bottom bar on phones
        ================================= */}
        <aside
          id="ad-side"
          className={`ad-side${sidebarOpen ? ' is-open' : ''}`}
          style={{ '--i': Math.max(activeIndex, 0) } as CSSProperties}
        >
          {/* Brand */}
          <div className="ad-brand">
            <Link href="/" onClick={() => setSidebarOpen(false)}>
              <span className="ad-logo">SA</span>
              <span className="ad-lbl ad-brandname">
                Super Admin
                <small className="ad-brandtag">PLATFORM</small>
              </span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className={`ad-nav${activeIndex < 0 ? ' no-active' : ''}`} aria-label="Super admin">
            <span className="ad-mk" aria-hidden="true" />
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
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
            subtitle="Super admin"
            signingOut={signingOut}
            onSignOut={handleSignOut}
            onNavigate={() => () => setSidebarOpen(false)}
          />
        </aside>

        {/* =================================
            PHONE TOP BAR (hidden on desktop by CSS)
        ================================= */}
        <div className="ad-appbar">
          <div className="ad-appbar-id">
            <span className="ad-logo ad-logo-sm">SA</span>
            <span className="ad-appbar-text">
              <b>{APP_NAME}</b>
              <small>{title}</small>
            </span>
          </div>
          <div className="ad-appbar-actions">
            {fsSupported && (
              <button
                type="button"
                className="ad-iconbtn"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              >
                {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
            )}
            <ProfileMenu
              variant="bar"
              user={user}
              subtitle="Super admin"
              signingOut={signingOut}
              onSignOut={handleSignOut}
              onNavigate={() => () => setSidebarOpen(false)}
            />
          </div>
        </div>

        {/* =================================
            PAPER SHELL (MAIN CONTENT)
        ================================= */}
        <main ref={shellRef} className="ad-shell">
          <div key={pathname} className="ad-page">
            <div className="mx-auto w-full max-w-[1600px]">
              {children}
            </div>
          </div>
          {sidebarOpen && (
            <button
              type="button"
              className="ad-scrim"
              aria-label="Close menu"
              onClick={() => setSidebarOpen(false)}
            />
          )}
        </main>

        <button
          type="button"
          className="ad-navtog"
          aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={sidebarOpen}
          aria-controls="ad-side"
          onClick={() => setSidebarOpen(open => !open)}
        >
          {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
    </>
  );
}
