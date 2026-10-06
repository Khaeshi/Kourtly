'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { Toaster } from 'sileo';
import { APP_NAME } from '@/lib/config';
import AdminSidebar from './AdminSidebar';
import { CapabilitiesProvider, CapabilityGate } from '@/lib/entitlements';
import { ConnectivityProvider, useConnectivity } from '@/lib/connectivity';
import AdminPrefetchRunner from '@/lib/adminPrefetch';
import { disconnectSocket, getSocket } from '@/lib/socket';
import { setProxyIdentity } from '@/lib/api';
import {
  ensureAdminOfflineIdentity,
  getNetworkOfflineState,
  initializeAdminOfflineIdentity,
  prefetchAdminRoutesWhenIdle,
} from '@/lib/offlineCache';

interface Props {
  children: React.ReactNode;
  buildId: string;
  user: { name: string; email: string; image: string }
}

function pageTitle(pathname: string): string {
  if (pathname === '/admin' || pathname === '/admin/') return 'Dashboard';
  const route = pathname.replace(/^\/admin\/?/, '').split('/')[0];
  const titles: Record<string, string> = {
    players: 'Players',
    items: 'Items',
    queue: 'Queue',
    reservation: 'Reservation',
    billing: 'Billing',
    schedule: 'Scheduling',
    settings: 'Settings',
  };
  return titles[route] ?? 'Admin';
}

function AdminLayoutContent({
  children,
  identity,
  pathname,
  user,
}: Pick<Props, 'children' | 'user'> & { identity: string | null; pathname: string }) {
  const { status, ready, sessionExpired, oldestSnapshot } = useConnectivity();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fsSupported, setFsSupported] = useState(false);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  const offline = status !== 'online';
  const title = pageTitle(pathname);
  const canRenderSnapshotPage = [
    '/admin',
    '/admin/players',
    '/admin/items',
    '/admin/queue',
    '/admin/reservation',
    '/admin/billing',
  ].some(route => route === '/admin'
    ? pathname === route
    : pathname === route || pathname.startsWith(`${route}/`));

  useEffect(() => {
    if (typeof document !== 'undefined') {
      setFsSupported(!!document.documentElement.requestFullscreen);
    }
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (typeof document === 'undefined') return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(console.warn);
    } else {
      document.exitFullscreen();
    }
  }, []);

  if (!ready) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-100 px-6">
        <p className="text-sm text-gray-500">Checking session...</p>
      </main>
    );
  }

  if (sessionExpired) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-100 px-6">
        <p className="text-sm text-gray-700">Session expired, reconnect to continue</p>
      </main>
    );
  }

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
      <div className="mobile-topbar">
        <button
          onClick={() => setSidebarOpen(open => !open)}
          aria-label="Toggle menu"
          className="flex flex-col gap-1 p-1.5 rounded-md border-none bg-transparent cursor-pointer"
        >
          <span className={`block w-[18px] h-[2px] bg-gray-700 rounded-sm transition-all duration-200 ${sidebarOpen ? 'rotate-45 translate-x-1 translate-y-1' : ''}`} />
          <span className={`block w-[18px] h-[2px] bg-gray-700 rounded-sm transition-all duration-200 ${sidebarOpen ? 'opacity-0' : 'opacity-100'}`} />
          <span className={`block w-[18px] h-[2px] bg-gray-700 rounded-sm transition-all duration-200 ${sidebarOpen ? '-rotate-45 translate-x-1 -translate-y-1' : ''}`} />
        </button>
        <span className="font-bold text-sm text-gray-900 tracking-tight">
          {APP_NAME}<span className="ml-2 text-gray-500 font-medium">· {title}</span>
        </span>

        {fsSupported && (
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className="ml-auto w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 transition-colors"
          >
            {isFullscreen ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 0 2-2h3M3 16h3a2 2 0 0 0 2 2v3"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
              </svg>
            )}
          </button>
        )}
      </div>

      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <CapabilitiesProvider key={identity ?? 'anonymous'}>
        <AdminPrefetchRunner />
        <div className="flex min-h-screen bg-gray-100 font-sans">
          <AdminSidebar
            isOpen={sidebarOpen}
            offline={offline}
            onClose={() => setSidebarOpen(false)}
            user={user}
          />
          <main className="admin-main flex-1 px-[clamp(1rem,3vw,2rem)] pb-[clamp(1rem,3vw,2rem)] pt-[clamp(1rem,3vw,2rem)] md:pt-[clamp(1rem,3vw,2rem)]">
            {offline && (
              <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {canRenderSnapshotPage
                  ? oldestSnapshot
                    ? `Offline. Showing data from ${new Date(oldestSnapshot.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : 'Offline. No saved data is available for this page.'
                  : `${title} is not available offline`}
              </p>
            )}
            {offline && !canRenderSnapshotPage
              ? null
              : <CapabilityGate>{children}</CapabilityGate>}
          </main>
        </div>
      </CapabilitiesProvider>
    </>
  );
}

export default function AdminLayoutClient({ children, buildId, user }: Props) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const initializedCacheKey = useRef<string | null>(null);
  const dbId = session?.user?.dbId;
  const courtId = session?.user?.courtId;
  const identity = dbId && courtId ? `${dbId}:${courtId}` : null;
  setProxyIdentity(identity);

  useEffect(() => {
    if (!pathname.startsWith('/admin') || !identity) return;
    const cacheKey = `${identity}:${buildId}`;
    if (initializedCacheKey.current === cacheKey) return;
    initializedCacheKey.current = cacheKey;

    if (!('serviceWorker' in navigator)) {
      void ensureAdminOfflineIdentity(identity).catch(error => {
        initializedCacheKey.current = null;
        console.error('Could not initialize offline admin identity.', error);
      });
      return;
    }

    const onServiceWorkerMessage = (event: MessageEvent<{ type?: string; message?: string }>) => {
      if (event.data?.type === 'ADMIN_ROUTES_CACHE_FAILED') {
        console.error('Could not prepare admin routes for offline use.', event.data.message);
      }
    };
    navigator.serviceWorker.addEventListener('message', onServiceWorkerMessage);

    void initializeAdminOfflineIdentity(identity, buildId)
      .then(async activeWorker => {
        const networkOffline = await getNetworkOfflineState();
        if (navigator.onLine && !networkOffline) prefetchAdminRoutesWhenIdle(activeWorker);
      })
      .catch(error => {
        initializedCacheKey.current = null;
        console.error('Could not initialize offline admin storage.', error);
      });

    return () => navigator.serviceWorker.removeEventListener('message', onServiceWorkerMessage);
  }, [buildId, identity, pathname]);

  useEffect(() => {
    if (!pathname.startsWith('/admin') || !document.documentElement.requestFullscreen) return;
    const timer = window.setTimeout(() => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {
          // The browser may block fullscreen without a user gesture.
        });
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (!courtId) return;
    getSocket(courtId);
    return () => disconnectSocket();
  }, [courtId]);

  return (
    <ConnectivityProvider key={identity ?? 'anonymous'} identity={identity} pathname={pathname}>
      <AdminLayoutContent identity={identity} pathname={pathname} user={user}>
        {children}
      </AdminLayoutContent>
    </ConnectivityProvider>
  );
}
