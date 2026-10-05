/* eslint-disable no-restricted-globals */
const SW_VERSION = 'v3';
const APP_SHELL = `app-shell-${SW_VERSION}`;
const PUBLIC_DATA = `public-data-${SW_VERSION}`;
const ADMIN_CACHE_PREFIX = 'kourtly-admin-';
const DB_NAME = 'kourtly-offline';
const DB_VERSION = 1;
const META_STORE = 'meta';
const MAX_ADMIN_CACHE_AGE_MS = 24 * 60 * 60 * 1000;
const ADMIN_BUILD_CACHE_AGE_PREFIX = 'adminBuildCachedAt:';
const ADMIN_ROUTES = [
  '/admin',
  '/admin/players',
  '/admin/queue',
  '/admin/items',
  '/admin/reservation',
  '/admin/billing',
  '/admin/schedule',
  '/admin/settings',
];

const SHELL_URLS = ['/', '/offline', '/manifest.webmanifest'];
const PUBLIC_NAVIGATION_PATHS = new Set([
  '/',
  '/offline',
  '/courts',
  '/for-courts',
  '/usercourts',
]);

let workerBuildId = new URL(self.location.href).searchParams.get('buildId');
let workerBuildIdLoaded = Boolean(workerBuildId);
let workerIdentity = null;
let workerIdentityLoaded = false;
let networkOffline = false;
let networkOfflineLoaded = false;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL)
      .then((cache) => cache.addAll(SHELL_URLS))
      // Activate new workers immediately so build-specific caches stay aligned.
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const buildId = await getWorkerBuildId();
    if (buildId) await writeMeta('buildId', buildId);
    await getWorkerIdentity();
    await getNetworkOfflineState();

    const keep = new Set([APP_SHELL, PUBLIC_DATA]);
    await Promise.all(
      (await caches.keys())
        .filter((name) => !keep.has(name) && !name.startsWith(ADMIN_CACHE_PREFIX))
        .map((name) => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

function openOfflineDatabase() {
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
    request.onerror = () => reject(request.error || new Error('Could not open offline storage.'));
  });
}

async function readMeta(key) {
  const database = await openOfflineDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(META_STORE, 'readonly').objectStore(META_STORE).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not read offline identity.'));
    });
  } finally {
    database.close();
  }
}

async function getWorkerBuildId() {
  if (workerBuildIdLoaded) return workerBuildId;
  workerBuildIdLoaded = true;
  workerBuildId = await readMeta('buildId').catch((error) => {
    console.error('Could not read the offline build ID.', error);
    return null;
  });
  return workerBuildId;
}

async function getWorkerIdentity() {
  if (workerIdentityLoaded) return workerIdentity;
  workerIdentityLoaded = true;
  workerIdentity = await readMeta('identity').catch((error) => {
    console.error('Could not read the offline admin identity.', error);
    return null;
  });
  return workerIdentity;
}

async function getNetworkOfflineState() {
  if (networkOfflineLoaded) return networkOffline;
  networkOfflineLoaded = true;
  networkOffline = await readMeta('networkOffline').catch((error) => {
    console.error('Could not read the saved network state.', error);
    return false;
  });
  return networkOffline === true;
}

async function markNetworkOffline() {
  networkOffline = true;
  networkOfflineLoaded = true;
  await writeMeta('networkOffline', true).catch((error) => {
    console.error('Could not save the offline navigation state.', error);
  });
}

async function markNetworkOnline() {
  const wasOffline = await getNetworkOfflineState();
  networkOffline = false;
  networkOfflineLoaded = true;
  if (!wasOffline) return;

  await writeMeta('networkOffline', false).catch((error) => {
    console.error('Could not save the online navigation state.', error);
  });

  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of clients) client.postMessage({ type: 'ONLINE_DETECTED' });
}

async function writeMeta(key, value) {
  const database = await openOfflineDatabase();
  try {
    await new Promise((resolve, reject) => {
      const request = database.transaction(META_STORE, 'readwrite').objectStore(META_STORE).put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Could not save offline identity.'));
    });
  } finally {
    database.close();
  }
}

async function deleteMeta(key) {
  const database = await openOfflineDatabase();
  try {
    await new Promise((resolve, reject) => {
      const request = database.transaction(META_STORE, 'readwrite').objectStore(META_STORE).delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Could not remove cached page metadata.'));
    });
  } finally {
    database.close();
  }
}

async function deleteMetaKeysWithPrefix(prefix) {
  const database = await openOfflineDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(META_STORE, 'readwrite');
      const store = transaction.objectStore(META_STORE);
      const request = store.getAllKeys();
      request.onsuccess = () => {
        for (const key of request.result) {
          if (typeof key === 'string' && key.startsWith(prefix)) store.delete(key);
        }
      };
      request.onerror = () => reject(request.error || new Error('Could not read offline metadata keys.'));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not clear offline metadata.'));
      transaction.onabort = () => reject(transaction.error || new Error('Offline metadata cleanup was aborted.'));
    });
  } finally {
    database.close();
  }
}

async function wipeOfflineStorage() {
  await Promise.all((await caches.keys()).map((name) => caches.delete(name)));
  workerIdentity = null;
  workerIdentityLoaded = true;
  networkOffline = false;
  networkOfflineLoaded = true;
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('Could not clear offline storage.'));
  });
}

async function notifyClientsToWipe() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of clients) client.postMessage({ type: 'CLEAR_OFFLINE_DATA' });
}

async function notifyClientsOffline() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of clients) client.postMessage({ type: 'OFFLINE_DETECTED' });
}

async function wipeAndNotifyClients() {
  try {
    await wipeOfflineStorage();
  } catch (error) {
    console.error('Could not clear offline storage after the session became invalid.', error);
  }
  await notifyClientsToWipe();
}

function offlineJsonResponse() {
  return new Response(JSON.stringify({ error: 'Offline' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function cacheName(buildId, identity) {
  return `${ADMIN_CACHE_PREFIX}${buildId}-${encodeURIComponent(identity)}`;
}

function pageCachedAtKey(buildId, identity, pathname) {
  return `adminPageCachedAt:${buildId}:${encodeURIComponent(identity)}:${pathname}`;
}

function buildCachedAtKey(buildId, identity) {
  return `${ADMIN_BUILD_CACHE_AGE_PREFIX}${buildId}:${encodeURIComponent(identity)}`;
}

function isAdminRoute(pathname) {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return ADMIN_ROUTES.includes(normalized);
}

function isPublicNavigation(pathname) {
  return PUBLIC_NAVIGATION_PATHS.has(pathname) ||
    /^\/book\/[^/]+$/.test(pathname);
}

function adminOfflineResponse() {
  return new Response(
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Offline</title><body><main><h1>Not available offline</h1></main></body></html>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

function expiredSessionResponse() {
  return new Response(
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Session expired</title><body><main><h1>Session expired, reconnect to continue</h1></main></body></html>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

async function cacheStaticAssets(html, cache) {
  const assetPaths = new Set();
  const tags = html.matchAll(/<(?:script|link)\b[^>]*>/gi);
  for (const [tag] of tags) {
    for (const [, rawUrl] of tag.matchAll(/(?:src|href)=["']([^"']+)["']/gi)) {
      const assetUrl = new URL(rawUrl, self.location.origin);
      if (assetUrl.origin === self.location.origin && assetUrl.pathname.startsWith('/_next/static/')) {
        assetPaths.add(assetUrl.href);
      }
    }
  }

  for (const assetUrl of assetPaths) {
    const request = new Request(assetUrl);
    if (await cache.match(request)) continue;
    const response = await fetch(request);
    if (!response.ok) throw new Error(`Could not cache required app asset: ${new URL(assetUrl).pathname}`);
    await cache.put(request, response);
  }
}

async function cacheAdminPage(pathname, identity, buildId) {
  const pageUrl = new URL(pathname, self.location.origin);
  const request = new Request(pageUrl, {
    credentials: 'include',
    headers: { Accept: 'text/html' },
  });
  const response = await fetch(request);
  await markNetworkOnline();
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || response.redirected || !contentType.includes('text/html')) {
    throw new Error(`Could not cache admin route: ${pathname}`);
  }

  const html = await response.clone().text();
  const cache = await caches.open(cacheName(buildId, identity));
  const pageKey = new URL(pageUrl.pathname, self.location.origin);
  await cacheStaticAssets(html, cache);
  await cache.put(pageKey, response);
  await writeMeta(pageCachedAtKey(buildId, identity, pageUrl.pathname), Date.now());
}

async function getFreshCachedAdminPage(cache, buildId, identity, pathname) {
  const pageUrl = new URL(pathname, self.location.origin);
  const cached = await cache.match(pageUrl);
  if (!cached) return null;

  const cacheTime = await readMeta(pageCachedAtKey(buildId, identity, pathname)).catch((error) => {
    console.error('Could not read the cached admin page timestamp.', error);
    return null;
  });
  const now = Date.now();
  if (!Number.isFinite(cacheTime) || cacheTime > now || now - cacheTime >= MAX_ADMIN_CACHE_AGE_MS) {
    await cache.delete(pageUrl);
    await deleteMeta(pageCachedAtKey(buildId, identity, pathname));
    return expiredSessionResponse();
  }
  return cached;
}

async function getOlderBuildCaches(currentBuildId, identity) {
  const identitySuffix = `-${encodeURIComponent(identity)}`;
  const currentCacheName = cacheName(currentBuildId, identity);
  const names = (await caches.keys()).filter((name) =>
    name.startsWith(ADMIN_CACHE_PREFIX) &&
    name.endsWith(identitySuffix) &&
    name !== currentCacheName
  );
  const indexedNames = names.map((name, index) => ({
    name,
    buildId: name.slice(ADMIN_CACHE_PREFIX.length, -identitySuffix.length),
    fallbackOrder: names.length - index,
  }));
  const withTimes = await Promise.all(indexedNames.map(async (entry) => ({
    ...entry,
    cachedAt: await readMeta(buildCachedAtKey(entry.buildId, identity)).catch(() => null),
  })));
  return withTimes
    .sort((a, b) => {
      const aTime = Number.isFinite(a.cachedAt) ? a.cachedAt : a.fallbackOrder;
      const bTime = Number.isFinite(b.cachedAt) ? b.cachedAt : b.fallbackOrder;
      return bTime - aTime;
    });
}

async function findOfflineAdminPage(identity, buildId, pathname) {
  const currentCache = await caches.open(cacheName(buildId, identity));
  const currentPage = await getFreshCachedAdminPage(currentCache, buildId, identity, pathname);
  if (currentPage) return currentPage;

  const olderCaches = await getOlderBuildCaches(buildId, identity);
  for (const older of olderCaches) {
    const cache = await caches.open(older.name);
    const page = await getFreshCachedAdminPage(cache, older.buildId, identity, pathname);
    if (page) return page;
  }
  return null;
}

async function handleAdminNavigation(request) {
  const requestUrl = new URL(request.url);
  const pathname = requestUrl.pathname;
  const identity = await getWorkerIdentity();

  let response;
  try {
    response = await fetch(request);
  } catch {
    await markNetworkOffline();
    await notifyClientsOffline();
    const buildId = await getWorkerBuildId();
    if (identity && buildId) {
      const cached = await findOfflineAdminPage(identity, buildId, pathname);
      if (cached) return cached;
    }
    return adminOfflineResponse();
  }

  if (
    (response.redirected && response.url.includes('/auth/signin')) ||
    response.status === 401 ||
    response.status === 403
  ) {
    await wipeAndNotifyClients();
    return response;
  }

  await markNetworkOnline();
  if (identity && response.ok && !response.redirected &&
      (response.headers.get('content-type') || '').includes('text/html')) {
    try {
      const html = await response.clone().text();
      const buildId = await getWorkerBuildId();
      if (buildId) {
        const cache = await caches.open(cacheName(buildId, identity));
        const pageUrl = new URL(pathname, self.location.origin);
        await cacheStaticAssets(html, cache);
        await cache.put(pageUrl, response.clone());
        await writeMeta(pageCachedAtKey(buildId, identity, pathname), Date.now());
      }
    } catch (error) {
      console.error('Could not refresh the cached admin document or its assets.', error);
    }
  }
  return response;
}

async function handleSignInNavigation(request) {
  if (await getWorkerIdentity()) await wipeAndNotifyClients();

  try {
    const response = await fetch(request);
    await markNetworkOnline();
    return response;
  } catch {
    return (await caches.match('/offline')) || adminOfflineResponse();
  }
}

async function precacheAdminRoutes(source) {
  const identity = await getWorkerIdentity();
  if (!identity) throw new Error('Admin cache identity is not set.');
  const buildId = await getWorkerBuildId();
  if (!buildId) throw new Error('Admin cache build ID is not set.');
  const cached = [];
  const failed = [];
  for (const route of ADMIN_ROUTES) {
    try {
      await cacheAdminPage(route, identity, buildId);
      cached.push(route);
    } catch (error) {
      console.error(`Could not cache admin route ${route}.`, error);
      failed.push(route);
    }
  }
  if (cached.length > 0) {
    try {
      await writeMeta('precachedBuildId', buildId);
      await writeMeta(buildCachedAtKey(buildId, identity), Date.now());
      await pruneAdminBuildCaches(buildId, identity);
    } catch (error) {
      console.error('Could not record or prune admin build caches.', error);
    }
  }

  source?.postMessage({ type: 'ADMIN_ROUTES_CACHED', buildId, cached, failed });
  if (cached.length === 0) {
    source?.postMessage({
      type: 'ADMIN_ROUTES_CACHE_FAILED',
      message: 'No admin routes could be cached.',
      buildId,
      cached,
      failed,
    });
  }
}

async function pruneAdminBuildCaches(buildId, identity) {
  const currentName = cacheName(buildId, identity);
  const older = await getOlderBuildCaches(buildId, identity);
  const keep = new Set([currentName, ...older.slice(0, 1).map((entry) => entry.name)]);
  const allNames = await caches.keys();
  await Promise.all(allNames
    .filter((name) => name.startsWith(ADMIN_CACHE_PREFIX) && !keep.has(name))
    .map((name) => caches.delete(name)));

  for (const entry of older.slice(1)) {
    for (const route of ADMIN_ROUTES) {
      await deleteMeta(pageCachedAtKey(entry.buildId, identity, route)).catch((error) => {
        console.error('Could not remove metadata for an old admin page cache.', error);
      });
    }
    await deleteMeta(buildCachedAtKey(entry.buildId, identity)).catch((error) => {
      console.error('Could not remove metadata for an old admin build cache.', error);
    });
  }
}

function isPublicGetApi(url) {
  return url.pathname.startsWith('/api/public/') && url.pathname !== '/api/public/courts';
}

function isPublicCourtsList(url) {
  return url.pathname === '/api/public/courts';
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SET_ADMIN_IDENTITY') {
    event.waitUntil((async () => {
      const identity = event.data.identity;
      if (typeof identity !== 'string' || !identity) {
        throw new Error('Admin cache identity is invalid.');
      }

      const previousIdentity = await readMeta('identity');
      if (previousIdentity !== identity) {
        const identitySuffix = `-${encodeURIComponent(identity)}`;
        const adminCaches = (await caches.keys())
          .filter((name) => name.startsWith(ADMIN_CACHE_PREFIX) && !name.endsWith(identitySuffix));
        await Promise.all(adminCaches.map((name) => caches.delete(name)));
        await deleteMetaKeysWithPrefix('adminPageCachedAt:');
      }

      await writeMeta('identity', identity);
      workerIdentity = identity;
      workerIdentityLoaded = true;
    })());
  } else if (event.data?.type === 'PRECACHE_ADMIN_ROUTES') {
    event.waitUntil(precacheAdminRoutes(event.source).catch((error) => {
      event.source?.postMessage({ type: 'ADMIN_ROUTES_CACHE_FAILED', message: error.message });
    }));
  } else if (event.data?.type === 'CLEAR_OFFLINE_DATA') {
    event.waitUntil(wipeOfflineStorage());
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (
    request.method === 'GET' &&
    request.mode === 'navigate' &&
    url.pathname.replace(/\/+$/, '') === '/auth/signin'
  ) {
    event.respondWith(handleSignInNavigation(request));
    return;
  }

  if (url.pathname === '/api/proxy' || url.pathname.startsWith('/api/proxy/')) {
    event.respondWith((async () => {
      let response;
      try {
        response = await fetch(request);
      } catch {
        await markNetworkOffline();
        await notifyClientsOffline();
        return offlineJsonResponse();
      }
      await markNetworkOnline();
      if (response.status === 401) {
        await wipeAndNotifyClients();
      }
      return response;
    })());
    return;
  }

  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/auth') || url.pathname.startsWith('/api/auth')) return;

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith((async () => {
      const identity = await getWorkerIdentity();
      const buildId = await getWorkerBuildId();
      let cache;
      if (identity && buildId) {
        cache = await caches.open(cacheName(buildId, identity));
        const cached = await cache.match(request);
        if (cached) return cached;
      }
      let response;
      try {
        response = await fetch(request);
      } catch {
        await markNetworkOffline();
        await notifyClientsOffline();
        return offlineJsonResponse();
      }
      await markNetworkOnline();
      if (cache && response.ok) await cache.put(request, response.clone());
      return response;
    })());
    return;
  }

  if (url.pathname === '/_next/image') {
    event.respondWith((async () => {
      const identity = await getWorkerIdentity();
      const buildId = await getWorkerBuildId();
      let cache;
      if (identity && buildId) {
        cache = await caches.open(cacheName(buildId, identity));
        const cached = await cache.match(request);
        if (cached) return cached;
      }
      let response;
      try {
        response = await fetch(request);
      } catch {
        await markNetworkOffline();
        await notifyClientsOffline();
        return offlineJsonResponse();
      }
      await markNetworkOnline();
      if (cache && response.ok) await cache.put(request, response.clone());
      return response;
    })());
    return;
  }

  if (request.destination === 'style' || request.destination === 'script' ||
      request.destination === 'font' || request.destination === 'image') {
    event.respondWith((async () => {
      const identity = await getWorkerIdentity();
      const buildId = await getWorkerBuildId();
      if (!identity || !buildId) {
        const response = await fetch(request);
        await markNetworkOnline();
        return response;
      }
      const cache = await caches.open(cacheName(buildId, identity));
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      await markNetworkOnline();
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })());
    return;
  }

  if (isPublicCourtsList(url)) {
    event.respondWith((async () => {
      const identity = await getWorkerIdentity();
      if (!identity) {
        const response = await fetch(request);
        await markNetworkOnline();
        return response;
      }
      const cache = await caches.open(PUBLIC_DATA);
      const cached = await cache.match(request);
      const networkFetch = fetch(request).then(async (response) => {
        await markNetworkOnline();
        if (response.ok) await cache.put(request, response.clone());
        return response;
      }).catch(() => cached);
      return cached || networkFetch;
    })());
    return;
  }

  if (isPublicGetApi(url)) {
    event.respondWith((async () => {
      const identity = await getWorkerIdentity();
      if (!identity) {
        const response = await fetch(request);
        await markNetworkOnline();
        return response;
      }
      return fetch(request).then(async (response) => {
        await markNetworkOnline();
        if (response.ok) await (await caches.open(PUBLIC_DATA)).put(request, response.clone());
        return response;
      }).catch(async () => (await caches.match(request)));
    })());
    return;
  }

  if (request.mode === 'navigate' && isAdminRoute(url.pathname)) {
    event.respondWith(handleAdminNavigation(request));
    return;
  }

  if (request.mode === 'navigate' && isPublicNavigation(url.pathname)) {
    event.respondWith(fetch(request).then(async (response) => {
      await markNetworkOnline();
      if (response.ok) await (await caches.open(APP_SHELL)).put(request, response.clone());
      return response;
    }).catch(async () => (await caches.match(request)) || (await caches.match('/offline'))));
  }
});
