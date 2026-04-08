/* eslint-disable no-restricted-globals */
const SW_VERSION = "v1";
const APP_SHELL = `app-shell-${SW_VERSION}`;
const PUBLIC_DATA = `public-data-${SW_VERSION}`;

const SHELL_URLS = ["/", "/offline", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => ![APP_SHELL, PUBLIC_DATA].includes(k)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isPublicGetApi(url) {
  return url.pathname.startsWith("/api/public/") && url.pathname !== "/api/public/courts";
}

function isPublicCourtsList(url) {
  return url.pathname === "/api/public/courts";
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return;
  }

  if (url.origin !== self.location.origin) {
    return;
  }

  // App shell/static assets: cache first
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

  // Public API list: stale-while-revalidate
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

  // Public API detail/schedule/availability: network first, fallback cache
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

  // Navigation requests: network first, fallback cache, then offline page
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(APP_SHELL).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match("/offline")))
    );
  }
});
