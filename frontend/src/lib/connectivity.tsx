'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ApiError, proxyFetch } from '@/lib/api';
import { wipeOfflineData } from '@/lib/offlineCache';
import {
  getOldestSnapshotMetadata,
  readLastOnlineAt,
  type SnapshotMetadata,
  SNAPSHOT_TTL_MS,
} from '@/lib/snapshotStore';

export type ConnectivityStatus = 'online' | 'offline' | 'degraded';

interface ConnectivityValue {
  status: ConnectivityStatus;
  ready: boolean;
  sessionExpired: boolean;
  oldestSnapshot: SnapshotMetadata | undefined;
}

const ConnectivityContext = createContext<ConnectivityValue>({
  status: 'online',
  ready: false,
  sessionExpired: false,
  oldestSnapshot: undefined,
});

const SNAPSHOT_ENDPOINTS: Record<string, readonly string[]> = {
  dashboard: ['/analytics/summary', '/players', '/queue'],
  players: ['/players'],
  items: ['/items'],
  queue: ['/players', '/queue', '/items/splittable'],
  reservation: ['/reservations'],
  billing: ['/players', '/items', '/tabs/open', '/tabs/history', '/reservation-tabs/today', '/reservation-tabs/history'],
};

function routeKey(pathname: string): string | undefined {
  const route = pathname.replace(/^\/admin\/?/, '').split('/')[0];
  if (!route) return 'dashboard';
  return route in SNAPSHOT_ENDPOINTS ? route : undefined;
}

export function ConnectivityProvider({
  children,
  identity,
  pathname,
}: {
  children: React.ReactNode;
  identity: string | null;
  pathname: string;
}) {
  const [status, setStatus] = useState<ConnectivityStatus>('online');
  const [networkInitialized, setNetworkInitialized] = useState(false);
  const [ready, setReady] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [oldestSnapshot, setOldestSnapshot] = useState<SnapshotMetadata>();
  const [retryDelay, setRetryDelay] = useState(15_000);
  const statusRef = useRef<ConnectivityStatus>('online');

  useEffect(() => {
    const updateStatus = (nextStatus: ConnectivityStatus) => {
      const wasOnline = statusRef.current === 'online';
      statusRef.current = nextStatus;
      setStatus(nextStatus);
      if (nextStatus === 'online') {
        setReady(true);
        setSessionExpired(false);
        setRetryDelay(15_000);
      } else if (wasOnline) {
        setReady(false);
      }
    };
    const setNetworkStatus = () => updateStatus(navigator.onLine ? 'online' : 'offline');
    const onConnectivity = (event: Event) => {
      const detail = (event as CustomEvent<{ status?: ConnectivityStatus }>).detail;
      if (detail?.status) updateStatus(detail.status);
    };
    const onServiceWorkerMessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === 'OFFLINE_DETECTED') updateStatus('offline');
    };
    setNetworkStatus();
    setNetworkInitialized(true);
    window.addEventListener('online', setNetworkStatus);
    window.addEventListener('offline', setNetworkStatus);
    window.addEventListener('kourtly:connectivity', onConnectivity);
    navigator.serviceWorker?.addEventListener('message', onServiceWorkerMessage);
    return () => {
      window.removeEventListener('online', setNetworkStatus);
      window.removeEventListener('offline', setNetworkStatus);
      window.removeEventListener('kourtly:connectivity', onConnectivity);
      navigator.serviceWorker?.removeEventListener('message', onServiceWorkerMessage);
    };
  }, []);

  const checkOfflineWindow = useCallback(async (): Promise<boolean> => {
    if (statusRef.current === 'online') return false;
    if (!identity) {
      setSessionExpired(true);
      return true;
    }
    const lastOnlineAt = await readLastOnlineAt(identity);
    if ((statusRef.current as ConnectivityStatus) === 'online') return false;
    const age = lastOnlineAt === undefined ? Number.POSITIVE_INFINITY : Date.now() - lastOnlineAt;
    const expired = !Number.isFinite(lastOnlineAt) || age < 0 || age >= SNAPSHOT_TTL_MS;
    if (expired) {
      setSessionExpired(true);
      try {
        await wipeOfflineData();
      } catch (error) {
        console.error('Could not wipe expired offline data.', error);
      }
      return true;
    }
    return false;
  }, [identity]);

  useEffect(() => {
    if (!networkInitialized) return;
    if (status === 'online') {
      setReady(true);
      return;
    }
    setReady(false);
    let active = true;
    void checkOfflineWindow()
      .catch(error => {
        console.error('Could not validate the offline session window.', error);
        setSessionExpired(true);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [checkOfflineWindow, networkInitialized, status]);

  useEffect(() => {
    if (status === 'online' || sessionExpired || !ready) return;
    let active = true;
    let timer: number | undefined;
    const scheduleExpiry = async () => {
      try {
        const lastOnlineAt = identity ? await readLastOnlineAt(identity) : undefined;
        if (!active) return;
        const age = lastOnlineAt === undefined ? Number.POSITIVE_INFINITY : Date.now() - lastOnlineAt;
        if (!Number.isFinite(lastOnlineAt) || age < 0 || age >= SNAPSHOT_TTL_MS) {
          await checkOfflineWindow();
          return;
        }
        timer = window.setTimeout(() => {
          if (active) {
            void checkOfflineWindow().catch(error => {
              console.error('Could not enforce the offline session limit.', error);
              setSessionExpired(true);
            });
          }
        }, SNAPSHOT_TTL_MS - age);
      } catch (error) {
        console.error('Could not schedule offline session expiry.', error);
        setSessionExpired(true);
      }
    };
    void scheduleExpiry();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [checkOfflineWindow, identity, ready, sessionExpired, status]);

  useEffect(() => {
    if (status === 'online' || sessionExpired || !ready) return;
    const timer = window.setTimeout(async () => {
      try {
        if (await checkOfflineWindow()) return;
        await proxyFetch('/court/me/capabilities', undefined, { allowSnapshotFallback: false });
        setRetryDelay(15_000);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return;
        setRetryDelay(delay => Math.min(delay * 2, 5 * 60_000));
      }
    }, retryDelay);
    return () => {
      window.clearTimeout(timer);
    };
  }, [checkOfflineWindow, identity, ready, retryDelay, sessionExpired, status]);

  useEffect(() => {
    if (status === 'online' || sessionExpired) {
      setOldestSnapshot(undefined);
      return;
    }
    const key = routeKey(pathname);
    const endpoints = key ? SNAPSHOT_ENDPOINTS[key] : undefined;
    if (!identity || !endpoints) {
      setOldestSnapshot(undefined);
      return;
    }
    let cancelled = false;
    void getOldestSnapshotMetadata(identity, endpoints)
      .then(metadata => {
        if (!cancelled) setOldestSnapshot(metadata);
      })
      .catch(error => console.error('Could not read offline snapshot timestamps.', error));
    return () => {
      cancelled = true;
    };
  }, [identity, pathname, sessionExpired, status]);

  const value = useMemo(
    () => ({ status, ready, sessionExpired, oldestSnapshot }),
    [oldestSnapshot, ready, sessionExpired, status]
  );
  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivity(): ConnectivityValue {
  return useContext(ConnectivityContext);
}
