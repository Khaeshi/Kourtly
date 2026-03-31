'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Toaster } from 'sileo';

const NAV = [
  { href: '/superadmin',        label: 'Dashboard', exact: true },
  { href: '/courts', label: 'Courts' },
  { href: '/users',       label: 'Users' },
];

interface Props {
  children: React.ReactNode;
  user: { name: string; email: string; image: string };
}

export default function SuperAdminLayoutClient({ children, user }: Props) {
  const pathname   = usePathname();
  const [signingOut, setSigningOut] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [ fsSupported, setFsSupported ] =useState(false);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;


  /**
   * @desc Check if fullscreen is supported (IOS safari not suuported)
   */
  useEffect(() => {
    setFsSupported(!!document.documentElement.requestFullscreen);
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

    // Auto-enter fullscreen when admin layout mounts
    useEffect(() => {
      if (!document.documentElement.requestFullscreen) return;
      // Small delay so the browser doesn't block the autoplay-style request
      const timer = setTimeout(() => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {
            // Browser may block auto-fullscreen without user gesture — that's fine,
            // the manual toggle button is still available
          });
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
      <Toaster position="top-right" options={{ fill: '#171717' }} />
      <div className="flex min-h-screen bg-gray-100 font-sans">

        {/* Sidebar */}
        <aside className="w-[220px] shrink-0 bg-white border-r border-gray-100 flex flex-col sticky top-0 h-screen">

          {/* Brand */}
          <div className="px-5 py-5 pb-4 border-b border-gray-100">
            <Link href="/" className="no-underline flex items-center gap-2.5">
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
            {NAV.map(item => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href}
                  className={`sidebar-item ${active ? 'active' : ''}`}>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${active ? 'bg-purple-700' : 'bg-gray-300'}`} />
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
                  <span className="text-[0.65rem] font-semibold text-purple-700">{user.name?.[0]?.toUpperCase() ?? '?'}</span>
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-800 truncate leading-tight">{user.name}</p>
                <p className="text-[0.58rem] font-semibold text-purple-500 uppercase tracking-wide">Super Admin</p>
              </div>
            </div>
            <button onClick={() => { setSigningOut(true); signOut({ callbackUrl: '/' }); }}
              disabled={signingOut}
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

        {/* Main */}
        <main className="flex-1 px-[clamp(1.5rem,3vw,2.5rem)] py-[clamp(1.5rem,3vw,2rem)]">
          {children}
        </main>
      </div>
    </>
  );
}