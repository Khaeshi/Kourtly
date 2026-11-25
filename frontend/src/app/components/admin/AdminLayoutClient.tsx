'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { Toaster } from 'sileo';
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
    registration: 'Registration status',
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
  const shellRef = useRef<HTMLElement>(null);
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

  // The shell is now the scroll container, so reset it (and drop rail focus) on every page change.
  useEffect(() => {
    shellRef.current?.scrollTo({ top: 0 });
    const active = document.activeElement as HTMLElement | null;
    if (active?.closest?.('.ad-side')) active.blur();
  }, [pathname]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

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

      <CapabilitiesProvider key={identity ?? 'anonymous'}>
        <AdminPrefetchRunner />
        <div className="ad-app" data-nav-open={sidebarOpen ? 'true' : 'false'}>
          {/* Pine layer (rail on desktop, bottom bar on phones) + phone top bar */}
          <AdminSidebar
            isOpen={sidebarOpen}
            offline={offline}
            onClose={() => setSidebarOpen(false)}
            user={user}
            title={title}
            fsSupported={fsSupported}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
          />

          {/* Paper shell: slides out on rail hover (desktop), lifts when the menu is open (phone) */}
          <main ref={shellRef} className="ad-shell">
            <div key={pathname} className="ad-page">
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
