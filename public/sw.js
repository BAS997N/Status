const CACHE_NAME = 'status-997-shell-v3';
const APP_BASE = '/Status/';
const OFFLINE_URL = `${APP_BASE}offline.html`;
const APP_SHELL = [
  APP_BASE,
  `${APP_BASE}index.html`,
  `${APP_BASE}manifest.webmanifest`,
  `${APP_BASE}icon-192.png`,
  `${APP_BASE}icon-512.png`,
  OFFLINE_URL,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(APP_SHELL);
        const indexResponse = await fetch(`${APP_BASE}index.html`, { cache: 'no-store' });
        const indexText = await indexResponse.text();
        const assetPaths = [...indexText.matchAll(/(?:src|href)="(\/Status\/assets\/[^"]+)"/g)]
          .map((match) => match[1]);
        if (assetPaths.length > 0) await cache.addAll(assetPaths);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(APP_BASE)) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(`${APP_BASE}index.html`, copy));
          return response;
        })
        .catch(async () => (await caches.match(`${APP_BASE}index.html`)) || caches.match(OFFLINE_URL))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || network;
    })
  );
});
