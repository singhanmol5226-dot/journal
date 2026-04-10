/**
 * sw.js — Service Worker for Trade Journal
 * Caches all app assets and Chart.js for full offline use.
 */

const CACHE_NAME = 'trade-journal-v2';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/analytics.js',
  './js/charts.js',
  './js/calendar.js',
  './js/ai.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).catch((err) => {
      console.warn('Service Worker install cache failed:', err);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request).then((response) => {
        // Cache CDN resources — validate hostname to avoid caching arbitrary hosts
        if (response && response.status === 200) {
          try {
            const parsedUrl = new URL(event.request.url);
            if (parsedUrl.hostname === 'cdn.jsdelivr.net') {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
          } catch (_) { /* ignore invalid URLs */ }
        }
        return response;
      }).catch(() => {
        // Return cached response if available, otherwise return a generic offline response
        if (cachedResponse) return cachedResponse;
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      });
    })
  );
});
