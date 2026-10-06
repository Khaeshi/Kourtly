import { wipeSnapshots } from '@/lib/snapshotStore';

const DB_NAME = 'kourtly-offline';
const DB_VERSION = 1;
const META_STORE = 'meta';
const IDENTITY_KEY = 'identity';
const BUILD_ID_KEY = 'buildId';
const OFFLINE_KEY = 'networkOffline';
const openConnections = new Set<IDBDatabase>();

function openOfflineDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(META_STORE)) {
        request.result.createObjectStore(META_STORE);
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      openConnections.add(database);
      database.onversionchange = () => {
        database.close();
        openConnections.delete(database);
      };
      resolve(database);
    };
    request.onerror = () => reject(request.error ?? new Error('Could not open offline storage.'));
  });
}

async function readMeta<T>(key: string): Promise<T | undefined> {
  const database = await openOfflineDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(META_STORE, 'readonly').objectStore(META_STORE).get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error ?? new Error('Could not read offline identity.'));
    });
  } finally {
    database.close();
    openConnections.delete(database);
  }
}

export async function getNetworkOfflineState(): Promise<boolean> {
  return (await readMeta<boolean>(OFFLINE_KEY)) === true;
}

async function writeMeta(key: string, value: unknown): Promise<void> {
  const database = await openOfflineDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(META_STORE, 'readwrite').objectStore(META_STORE).put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('Could not save offline identity.'));
    });
  } finally {
    database.close();
    openConnections.delete(database);
  }
}

export async function wipeOfflineData(): Promise<void> {
  for (const database of openConnections) {
    database.close();
    openConnections.delete(database);
  }
  const results = await Promise.allSettled([
    (async () => {
      const cacheNames = await caches.keys();
      const cacheResults = await Promise.allSettled(cacheNames.map(cacheName => caches.delete(cacheName)));
      const failures = cacheResults
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map(result => result.reason);
      if (failures.length) throw new AggregateError(failures, 'Could not clear all service worker caches.');
    })(),
    deleteDatabase(DB_NAME, 'Could not clear offline storage.'),
    wipeSnapshots(),
  ]);
  const failures = results
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map(result => result.reason);
  if (failures.length) throw new AggregateError(failures, 'Could not completely clear offline data.');
}

export async function ensureAdminOfflineIdentity(identity: string): Promise<void> {
  const previousIdentity = await readMeta<string>(IDENTITY_KEY);
  if (previousIdentity !== identity) await wipeOfflineData();
  await writeMeta(IDENTITY_KEY, identity);
}

function deleteDatabase(name: string, errorMessage: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    let blockedTimer: ReturnType<typeof setTimeout> | undefined;
    request.onsuccess = () => {
      if (blockedTimer) clearTimeout(blockedTimer);
      resolve();
    };
    request.onerror = () => reject(request.error ?? new Error(errorMessage));
    request.onblocked = () => {
      for (const database of openConnections) {
        database.close();
        openConnections.delete(database);
      }
      if (!blockedTimer) {
        blockedTimer = setTimeout(() => {
          reject(new Error(`${errorMessage} Deletion remained blocked for 3 seconds.`));
        }, 3_000);
      }
    };
  });
}

export async function initializeAdminOfflineIdentity(
  identity: string,
  buildId: string
): Promise<ServiceWorker | null> {
  await ensureAdminOfflineIdentity(identity);
  await writeMeta(BUILD_ID_KEY, buildId);
  const existingRegistration = await navigator.serviceWorker.getRegistration();
  const networkOffline = await readMeta<boolean>(OFFLINE_KEY);
  const registration = networkOffline && !navigator.onLine && existingRegistration?.active
    ? existingRegistration
    : await navigator.serviceWorker.register(
        `/sw.js?buildId=${encodeURIComponent(buildId)}`,
        { updateViaCache: 'none' }
      );
  registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
  const installingWorker = registration.installing ?? registration.waiting;
  if (installingWorker && installingWorker.state !== 'activated') {
    await new Promise<void>((resolve, reject) => {
      const onStateChange = () => {
        if (installingWorker.state === 'activated') {
          installingWorker.removeEventListener('statechange', onStateChange);
          resolve();
        } else if (installingWorker.state === 'redundant') {
          installingWorker.removeEventListener('statechange', onStateChange);
          reject(new Error('The offline service worker could not activate.'));
        }
      };
      installingWorker.addEventListener('statechange', onStateChange);
      onStateChange();
    });
  }
  registration.active?.postMessage({ type: 'SET_ADMIN_IDENTITY', identity, buildId });
  return registration.active;
}

export function prefetchAdminRoutesWhenIdle(worker: ServiceWorker | null): void {
  const requestPrefetch = () => {
    worker?.postMessage({ type: 'PRECACHE_ADMIN_ROUTES' });
  };

  const scheduleIdle = (window as Window & {
    requestIdleCallback?: (callback: () => void) => number;
  }).requestIdleCallback;
  if (scheduleIdle) {
    scheduleIdle.call(window, requestPrefetch);
  } else {
    globalThis.setTimeout(requestPrefetch, 1000);
  }
}
