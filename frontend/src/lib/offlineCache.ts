const DB_NAME = 'kourtly-offline';
const DB_VERSION = 1;
const META_STORE = 'meta';
const IDENTITY_KEY = 'identity';
const BUILD_ID_KEY = 'buildId';
const OFFLINE_KEY = 'networkOffline';
const CAPABILITIES_KEY_PREFIX = 'adminCapabilities:';
const CAPABILITIES_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function openOfflineDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(META_STORE)) {
        request.result.createObjectStore(META_STORE);
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
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
  }
}

async function deleteMeta(key: string): Promise<void> {
  const database = await openOfflineDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(META_STORE, 'readwrite').objectStore(META_STORE).delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('Could not remove offline metadata.'));
    });
  } finally {
    database.close();
  }
}

export async function storeOfflineCapabilities<T>(identity: string, capabilities: T): Promise<void> {
  await writeMeta(`${CAPABILITIES_KEY_PREFIX}${identity}`, {
    capabilities,
    cachedAt: Date.now(),
  });
}

export async function getOfflineCapabilities<T>(identity: string): Promise<T | undefined> {
  const key = `${CAPABILITIES_KEY_PREFIX}${identity}`;
  const stored = await readMeta<{ capabilities: T; cachedAt: number }>(key);
  if (!stored) return undefined;

  const age = Date.now() - stored.cachedAt;
  if (!Number.isFinite(stored.cachedAt) || age < 0 || age >= CAPABILITIES_MAX_AGE_MS) {
    await deleteMeta(key);
    return undefined;
  }
  return stored.capabilities;
}

export async function wipeOfflineData(): Promise<void> {
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Could not clear offline storage.'));
  });
}

export async function initializeAdminOfflineIdentity(
  identity: string,
  buildId: string
): Promise<ServiceWorker | null> {
  const previousIdentity = await readMeta<string>(IDENTITY_KEY);
  if (previousIdentity !== identity) {
    await wipeOfflineData();
  }

  await writeMeta(IDENTITY_KEY, identity);
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
