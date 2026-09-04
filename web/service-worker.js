const CACHE = "theeb-arab-shell-v6";
const SHELL = [
  "/",
  "/app.webmanifest",
  "/brand.json",
  "/assets/app.css",
  "/assets/app.js",
  "/assets/icon.svg",
  "/assets/icon-maskable.svg",
  "/offline.html"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  if (url.pathname.startsWith("/v1/") || url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(async cached => {
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok && url.origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return response;
      } catch (error) {
        if (event.request.mode === "navigate") {
          return caches.match("/offline.html");
        }
        throw error;
      }
    })
  );
});
