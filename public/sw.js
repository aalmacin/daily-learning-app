/* DailyLearning — Service Worker
 * Strategy:
 *   - Precache app shell on install
 *   - Network-first for navigations: no caching, just network with a
 *     cached-shell / offline.html fallback if the network fails
 *   - Cache-first for static assets (icons, css, js, fonts), capped at
 *     MAX_STATIC_ENTRIES with FIFO eviction so content-hashed /_next/static
 *     assets from old deploys don't accumulate forever
 *   - Stale-while-revalidate for API/JSON, capped at MAX_RUNTIME_ENTRIES
 *     with the same FIFO eviction
 *   - The default catch-all (anything that isn't a navigation, api/json, or
 *     style/script/image/font asset — e.g. Next.js RSC/prefetch payloads)
 *     is never cached; it's a plain passthrough fetch
 *
 * Because both bounded caches now self-trim, routine deploys do NOT need a
 * CACHE_VERSION bump for storage-size reasons. Only bump CACHE_VERSION when
 * APP_SHELL itself changes, or to force a one-time cleanup of caches from
 * clients still holding pre-fix, unbounded caches.
 */

const CACHE_VERSION = 'v1.0.1';
const SHELL_CACHE   = `shell-${CACHE_VERSION}`;
const STATIC_CACHE  = `static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

const MAX_STATIC_ENTRIES  = 120;
const MAX_RUNTIME_ENTRIES = 60;

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
    event.respondWith(staleWhileRevalidate(event, request, RUNTIME_CACHE));
    return;
  }

  // Static assets -> cache-first
  if (['style', 'script', 'image', 'font'].includes(request.destination)) {
    event.respondWith(cacheFirst(event, request, STATIC_CACHE));
    return;
  }

  // Default: everything else (e.g. Next.js RSC/prefetch payloads) -> plain
  // network passthrough, no caching
  event.respondWith(fetch(request));
});

// ---- Strategies -------------------------------------------------------------
async function networkFirst(request) {
  try {
    return await fetch(request);
  } catch (_) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') return caches.match('/offline.html');
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function cacheFirst(event, request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh.ok) {
    const cache = await caches.open(cacheName);
    event.waitUntil(cache.put(request, fresh.clone()).then(() => trimCache(cache, MAX_STATIC_ENTRIES)));
  }
  return fresh;
}

async function staleWhileRevalidate(event, request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetching = fetch(request).then((res) => {
    if (res.ok) {
      event.waitUntil(cache.put(request, res.clone()).then(() => trimCache(cache, MAX_RUNTIME_ENTRIES)));
    }
    return res;
  }).catch(() => cached);
  return cached || fetching;
}

async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    await Promise.all(keys.slice(0, keys.length - maxEntries).map((k) => cache.delete(k)));
  }
}

// ---- Handle "skip waiting" message from the page ----------------------------
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
