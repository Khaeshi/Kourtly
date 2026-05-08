'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import Image from 'next/image';
import { Toaster } from 'sileo';
import { APP_NAME } from '@/lib/config';

interface Props {
  children: React.ReactNode;
  user: { name: string; email: string; image: string };
}

const NAV = [
  { href: '/superadmin', label: 'Dashboard', exact: true },
  { href: '/courts', label: 'Courts' },
  { href: '/users', label: 'Users' },
];

export default function SuperAdminLayoutClient({ children, user }: Props) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fsSupported, setFsSupported] = useState(false);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  /**
   * @desc Check if fullscreen is supported (IOS safari not supported)
   */
  useEffect(() => {
    setFsSupported(!!document.documentElement.requestFullscreen);
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Auto-enter fullscreen when layout mounts (best-effort; browser may block it)
  useEffect(() => {
    if (!document.documentElement.requestFullscreen) return;
    const timer = setTimeout(() => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(console.warn);
    } else {
      document.exitFullscreen();
    }
  }, []);

  return (
    <>
      <Toaster
        position={isMobile ? 'bottom-center' : 'top-right'}
        options={{
          fill: '#171717',
          styles: {
            title: 'text-white!',
            description: 'text-white/75!',
            badge: 'bg-white/10!',
          },
        }}
      />

      {/* Mobile top bar + slide-in sidebar (same as Admin layout). */}
      <div className="mobile-topbar">
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          aria-label="Toggle menu"
          className="flex flex-col gap-1 p-1.5 rounded-md border-none bg-transparent cursor-pointer"
        >
          <span
            className={`block w-[18px] h-[2px] bg-gray-700 rounded-sm transition-all duration-200 ${
              sidebarOpen ? 'rotate-45 translate-x-1 translate-y-1' : ''
            }`}
          />
          <span
            className={`block w-[18px] h-[2px] bg-gray-700 rounded-sm transition-all duration-200 ${
              sidebarOpen ? 'opacity-0' : 'opacity-100'
            }`}
          />
          <span
            className={`block w-[18px] h-[2px] bg-gray-700 rounded-sm transition-all duration-200 ${
              sidebarOpen ? '-rotate-45 translate-x-1 -translate-y-1' : ''
            }`}
          />
        </button>

        <span className="font-bold text-sm text-gray-900 tracking-tight">{APP_NAME}</span>

        {fsSupported && (
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className="ml-auto w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 transition-colors"
          >
            {isFullscreen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 0 2-2h3M3 16h3a2 2 0 0 0 2 2v3" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            )}
          </button>
        )}
      </div>

      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <div className="flex min-h-screen bg-gray-100 font-sans">
        <aside className={`admin-sidebar-aside ${sidebarOpen ? 'open' : ''}`}>
          {/* Brand */}
          <div className="px-5 py-5 pb-4 border-b border-gray-100">
            <Link
              href="/"
              className="no-underline flex items-center gap-2.5"
              onClick={() => setSidebarOpen(false)}
            >
              <div className="w-7 h-7 rounded-lg bg-purple-700 flex items-center justify-center shrink-0">
                <div className="w-2.5 h-2.5 rounded-full bg-white opacity-90" />
              </div>
              <span className="font-bold text-sm text-gray-900 tracking-tight">Super Admin</span>
            </Link>
          </div>

          {/* Nav */}
          <nav className="px-3 py-3 flex-1 flex flex-col gap-0.5">
            <p className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-400 px-3.5 mb-1">
              Platform
            </p>
            {NAV.map((item) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`sidebar-item ${active ? 'active' : ''}`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
                      active ? 'bg-purple-700' : 'bg-gray-300'
                    }`}
                  />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="px-3 py-4 border-t border-gray-100 flex flex-col gap-2">
            <div className="flex items-center gap-2.5 px-3.5 py-2">
              {user.image ? (
                <Image src={user.image} alt={user.name} width={26} height={26} className="rounded-full shrink-0" />
              ) : (
                <div className="w-[26px] h-[26px] rounded-full bg-purple-50 border border-purple-200 flex items-center justify-center shrink-0">
                  <span className="text-[0.65rem] font-semibold text-purple-700">
                    {user.name?.[0]?.toUpperCase() ?? '?'}
                  </span>
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-800 truncate leading-tight">{user.name}</p>
                <p className="text-[0.58rem] font-semibold text-purple-500 uppercase tracking-wide">Super Admin</p>
              </div>
            </div>

            <button
              onClick={() => {
                setSigningOut(true);
                signOut({ callbackUrl: '/' });
              }}
              disabled={signingOut}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs text-red-500 border border-red-100 bg-transparent cursor-pointer transition-colors hover:bg-red-50 disabled:opacity-50 w-full font-medium"
              style={{ fontFamily: 'inherit' }}
            >
              <span>↪</span>
              {signingOut ? 'Signing out...' : 'Sign Out'}
            </button>

            <Link
              href="/"
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg no-underline text-gray-500 text-xs hover:bg-gray-100 transition-colors"
            >
              ← View Site
            </Link>
          </div>
        </aside>

        <main className="admin-main flex-1 px-[clamp(1rem,3vw,2rem)] pb-[clamp(1rem,3vw,2rem)] pt-[clamp(1rem,3vw,2rem)] md:pt-[clamp(1rem,3vw,2rem)]">
          {children}
        </main>
      </div>
    </>
  );
}