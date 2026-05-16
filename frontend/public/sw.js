/* eslint-disable no-restricted-globals */
const SW_VERSION = "v3";
const APP_SHELL = `app-shell-${SW_VERSION}`;
const PUBLIC_DATA = `public-data-${SW_VERSION}`;

// Pre-cache on install — court admin shell (visit once online to refresh)
const SHELL_URLS = [
  "/",
  "/offline",
  "/manifest.webmanifest",
  "/admin",
  "/admin/queue",
  "/admin/billing",
  "/admin/items",
  "/admin/players",
  "/admin/schedule",
  "/admin/reservation",
  "/admin/settings",
];

const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL).then(async (cache) => {
      await Promise.all(
        SHELL_URLS.map(async (path) => {
          try {
            await cache.add(path);
          } catch {
            // Ignore failed precache (e.g. offline install)
          }
        })
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => ![APP_SHELL, PUBLIC_DATA].includes(k))
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("SW timeout")), ms);
    fetch(request)
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function isPublicGetApi(url) {
  return (
    url.pathname.startsWith("/api/public/") &&
    url.pathname !== "/api/public/courts"
  );
}

function isPublicCourtsList(url) {
  return url.pathname === "/api/public/courts";
}

function isAdminAppPath(pathname) {
  return pathname.startsWith("/admin") && !pathname.startsWith("/api/");
}

function isAdminAppRequest(url, request) {
  if (!isAdminAppPath(url.pathname)) return false;
  if (request.mode === "navigate") return true;
  if (url.searchParams.has("_rsc")) return true;
  const accept = request.headers.get("Accept") || "";
  if (accept.includes("text/x-component")) return true;
  if (request.headers.get("RSC") === "1") return true;
  if (request.headers.get("Next-Router-Prefetch")) return true;
  return false;
}

async function matchAdminFallback(url) {
  const pathOnly = await caches.match(url.pathname);
  if (pathOnly) return pathOnly;
  for (const shell of SHELL_URLS) {
    if (!shell.startsWith("/admin")) continue;
    if (url.pathname === shell || url.pathname.startsWith(`${shell}/`)) {
      const hit = await caches.match(shell);
      if (hit) return hit;
    }
  }
  return caches.match("/admin");
}

function adminCacheFirst(request, url) {
  return caches.match(request).then(async (cached) => {
    const networkUpdate = fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(APP_SHELL).then((cache) => {
            cache.put(request, copy);
            if (url.search) cache.put(url.pathname, copy);
          });
        }
        return response;
      })
      .catch(() => null);

    if (cached) {
      networkUpdate.catch(() => {});
      return cached;
    }

    const fresh = await networkUpdate;
    if (fresh) return fresh;

    const fallback = await matchAdminFallback(url);
    if (fallback) return fallback;

    return caches.match("/offline");
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  if (
    request.destination === "style" ||
    request.destination === "script" ||
    request.destination === "font" ||
    request.destination === "image"
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(APP_SHELL).then((cache) => cache.put(request, copy));
          return response;
        });
      })
    );
    return;
  }

  if (isPublicCourtsList(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(PUBLIC_DATA).then((cache) => cache.put(request, copy));
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }

  if (isPublicGetApi(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(PUBLIC_DATA).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Court admin: full document + Next.js client navigations (_rsc, prefetch)
  if (isAdminAppRequest(url, request)) {
    event.respondWith(adminCacheFirst(request, url));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetchWithTimeout(request, NETWORK_TIMEOUT_MS)
        .then((response) => {
          const copy = response.clone();
          caches.open(APP_SHELL).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          return (
            (await caches.match(request)) ||
            (await caches.match("/offline"))
          );
        })
    );
  }
});
