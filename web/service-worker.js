const CACHE = "theeb-arab-shell-v7";
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
const SHELL_PATHS = new Set(SHELL);

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

function offlineFallback(event, error) {
  if (event.request.mode === "navigate") {
    return caches.match("/offline.html");
  }
  throw error;
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;
  const cacheableShell =
    sameOrigin &&
    !url.search &&
    SHELL_PATHS.has(url.pathname);

  // Everything outside the explicit shell allowlist stays network-only.
  // This includes /api, /v1, /internal/admin, /readyz and /livez.
  if (!cacheableShell) {
    event.respondWith(
      fetch(event.request).catch(error => offlineFallback(event, error))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(async cached => {
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return response;
      } catch (error) {
        return offlineFallback(event, error);
      }
    })
  );
});
