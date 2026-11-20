const VERSION = 'WD-v0.3.1';
const CACHE = 'word-duel-' + VERSION;
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css?v=0.3.1',
  '/app.js?v=0.3.1',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/fonts/nunito.woff',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/socket.io') || req.headers.get('upgrade')) return;

  if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/healthz') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        if (url.pathname !== '/healthz') cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || caches.match('/index.html');
      }
    })());
    return;
  }

  // JS and CSS are network-first with a versioned URL, so a phone that still
  // has an older service worker will not keep serving a stale app.js that
  // never shows the "✓ word!" hint.
  const isAppAsset = url.pathname.endsWith('.js') || url.pathname.endsWith('.css');
  event.respondWith((async () => {
    if (isAppAsset) {
      try {
        const fresh = await fetch(req);
        if (fresh.ok) {
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || caches.match(url.pathname) || Response.error();
      }
    }
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      if (fresh.ok && url.origin === location.origin) {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch {
      return cached || Response.error();
    }
  })());
});
