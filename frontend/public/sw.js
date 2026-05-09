/* eslint-disable no-restricted-globals */
const SW_VERSION = "v2";
const APP_SHELL  = `app-shell-${SW_VERSION}`;
const PUBLIC_DATA = `public-data-${SW_VERSION}`;

// Pre-cache these on install — admin routes included
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
  "/admin/users",
];

// How long to wait for network before giving up (ms)
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
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

// Race: network vs timeout — whichever wins first
function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("SW timeout")), ms);
    fetch(request)
      .then((res) => { clearTimeout(timer); resolve(res); })
      .catch((err) => { clearTimeout(timer); reject(err); });
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

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // Static assets: cache first
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

  // Public courts list: stale-while-revalidate (unchanged)
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

  // Public API: network first, fallback cache (unchanged)
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

  // Navigation: cache first for admin, timeout-race for others
  if (request.mode === "navigate") {
    const isAdmin = url.pathname.startsWith("/admin");

    if (isAdmin) {
      // Admin routes: serve cache IMMEDIATELY, revalidate in background
      event.respondWith(
        caches.match(request).then((cached) => {
          const networkUpdate = fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(APP_SHELL).then((cache) => cache.put(request, copy));
            return response;
          });
          // Return cache instantly if available, otherwise wait for network
          return cached || networkUpdate;
        }).catch(() => caches.match("/offline"))
      );
    } else {
      // Non-admin: try network with timeout, fall back to cache then offline
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
    return;
  }
});