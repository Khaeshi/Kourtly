'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import Image from 'next/image';
import { Toaster } from 'sileo';
import { APP_NAME } from '@/lib/config';
import {
  LayoutDashboard,
  Users,
  ListOrdered,
  Menu,
  X,
  Maximize,
  Minimize,
  LogOut,
  ArrowLeft,
} from 'lucide-react';

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
    href: '/users',
    label: 'Users',
    icon: Users,
  },
];

export default function SuperAdminLayoutClient({ children, user }: Props) {
  const pathname = usePathname();

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
     Close sidebar after navigation
  -------------------------------- */
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  /* --------------------------------
     Prevent background scroll on mobile
  -------------------------------- */
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
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

      {/* =================================
          MOBILE TOP BAR
      ================================= */}
      <header className="fixed left-0 right-0 top-0 z-50 flex h-14 items-center border-b border-gray-200 bg-white px-4 shadow-sm sm:hidden">
        <button
          type="button"
          onClick={() => setSidebarOpen((open) => !open)}
          aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100"
        >
          {sidebarOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </button>

        <span className="ml-3 truncate text-sm font-bold tracking-tight text-gray-900">
          {APP_NAME}
        </span>

        {fsSupported && (
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
          >
            {isFullscreen ? (
              <Minimize className="h-4 w-4" />
            ) : (
              <Maximize className="h-4 w-4" />
            )}
          </button>
        )}
      </header>

      {/* =================================
          MOBILE BACKDROP
      ================================= */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 sm:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* =================================
          PAGE
      ================================= */}
      <div className="min-h-screen bg-gray-100 font-sans">
        {/* =================================
            SIDEBAR
        ================================= */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-gray-200 bg-white transition-transform duration-300 ease-in-out sm:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          {/* Brand */}
          <div className="flex min-h-[76px] items-center border-b border-gray-100 px-5">
            <Link
              href="/"
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-2.5 no-underline"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-700">
                <div className="h-2.5 w-2.5 rounded-full bg-white opacity-90" />
              </div>

              <span className="text-sm font-bold tracking-tight text-gray-900">
                Super Admin
              </span>
            </Link>

            {/* Mobile close button */}
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
              className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 sm:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <p className="mb-2 px-3.5 text-[0.65rem] font-semibold uppercase tracking-widest text-gray-400">
              Platform
            </p>

            <div className="space-y-1">
              {NAV.map((item) => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);

                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium no-underline transition-colors ${active ? 'bg-green-50 text-green-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 ${active ? 'text-green-700' : 'text-gray-400'}`}
                    />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* Footer */}
          <div className="space-y-2 border-t border-gray-100 p-3">
            {/* User */}
            <div className="flex items-center gap-2.5 px-3.5 py-2">
              {user.image ? (
                <Image
                  src={user.image}
                  alt={user.name}
                  width={28}
                  height={28}
                  className="h-7 w-7 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-purple-200 bg-purple-50">
                  <span className="text-xs font-semibold text-purple-700">
                    {user.name?.[0]?.toUpperCase() ?? '?'}
                  </span>
                </div>
              )}

              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-gray-800">
                  {user.name}
                </p>

                <p className="text-[0.58rem] font-semibold uppercase tracking-wide text-purple-500">
                  Super Admin
                </p>
              </div>
            </div>

            {/* Sign out */}
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex w-full items-center gap-2 rounded-lg border border-red-100 px-3.5 py-2.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" />
              {signingOut ? 'Signing out...' : 'Sign Out'}
            </button>

            {/* View site */}
            <Link
              href="/"
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-xs text-gray-500 no-underline transition-colors hover:bg-gray-100"
            >
              <ArrowLeft className="h-4 w-4" />
              View Site
            </Link>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="min-h-screen px-4 pb-6 pt-20 sm:ml-[260px] sm:px-6 sm:pb-8 sm:pt-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1600px]">
            {children}
          </div>
        </main>
      </div>
    </>
  );
}
