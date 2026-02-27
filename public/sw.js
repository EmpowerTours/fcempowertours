/**
 * Service Worker — Venue Player PWA
 *
 * Caching strategy:
 * - Player shell (HTML/CSS/JS): cache-first (offline support)
 * - Album art images: cache-first (loaded as encountered)
 * - Audio files: network-first (too large to cache all)
 * - API calls: network-first
 */

const CACHE_NAME = 'venue-player-v1';
const SHELL_ASSETS = [
  '/venue-icon-192.png',
  '/venue-icon-512.png',
];

// Install: pre-cache shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// Fetch: routing strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip SSE streams
  if (url.pathname.includes('/stream')) return;

  // Album art images: cache-first
  if (isImageRequest(url)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Audio files: network-first (too large to cache)
  if (isAudioRequest(url)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // API calls: network-first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Everything else (shell): cache-first with network fallback
  event.respondWith(cacheFirst(event.request));
});

function isImageRequest(url) {
  return (
    url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|avif)$/i) ||
    url.hostname.includes('ipfs') ||
    url.hostname.includes('nftstorage')
  );
}

function isAudioRequest(url) {
  return url.pathname.match(/\.(mp3|wav|ogg|flac|m4a|aac)$/i);
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('Offline', { status: 503 });
  }
}
