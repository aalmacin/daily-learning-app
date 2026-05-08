/* NoteMaker — Service Worker
 * Strategy:
 *   - Precache app shell on install
 *   - Network-first for navigations (fall back to cached shell offline)
 *   - Cache-first for static assets (icons, css, js, fonts)
 *   - Stale-while-revalidate for API/JSON
 * Bump CACHE_VERSION on every deploy that changes the precache list.
 */

const CACHE_VERSION = 'v1.0.0';
const SHELL_CACHE   = `shell-${CACHE_VERSION}`;
const STATIC_CACHE  = `static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

// ---- Install: precache the shell --------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ---- Activate: clean up old versions ----------------------------------------
self.addEventListener('activate', (event) => {
  const allow = new Set([SHELL_CACHE, STATIC_CACHE, RUNTIME_CACHE]);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !allow.has(k)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ---- Fetch routing ----------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Skip cross-origin (let the browser handle CDN/analytics directly)
  if (url.origin !== self.location.origin) return;

  // HTML navigations -> network-first, fall back to shell, then offline page
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // API / JSON -> stale-while-revalidate
  if (url.pathname.startsWith('/api/') || (request.destination === '' && request.headers.get('accept')?.includes('application/json'))) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }

  // Static assets -> cache-first
  if (['style', 'script', 'image', 'font'].includes(request.destination)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Default: try network, fall back to cache
  event.respondWith(networkFirst(request));
});

// ---- Strategies -------------------------------------------------------------
async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(SHELL_CACHE);
    cache.put(request, fresh.clone());
    return fresh;
  } catch (_) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') return caches.match('/offline.html');
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  const cache = await caches.open(cacheName);
  cache.put(request, fresh.clone());
  return fresh;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetching = fetch(request).then((res) => {
    cache.put(request, res.clone());
    return res;
  }).catch(() => cached);
  return cached || fetching;
}

// ---- Handle "skip waiting" message from the page ----------------------------
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
