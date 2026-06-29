// Bump CACHE_VERSION on every deploy — there is no build step to do this automatically,
// and it is the only thing that makes activate() drop the previous cache.
const CACHE_VERSION = 'v4';
const CACHE_NAME = `project-tracker-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  './',
  'index.html',
  'manifest.json',
  'css/styles.css',
  'css/mobile.css',
  'css/desktop.css',
  'js/app.js',
  'js/auth.js',
  'js/db.js',
  'js/tasks.js',
  'js/import.js',
  'js/export.js',
  'js/sync.js',
  'js/backup.js',
  'js/catalog.js',
  'js/calc.js',
  'js/reports.js',
  'js/settings.js',
  'js/utils.js',
  'js/pwa.js',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/dexie/3.2.4/dexie.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.all(
      PRECACHE_URLS.map((url) => cache.add(url).catch(() => {}))
    ))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Cache-first: serve from cache immediately, refresh the cache from the network in the background.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);

      const networkFetch = fetch(event.request).then((response) => {
        if (response && (response.ok || response.type === 'opaque')) {
          cache.put(event.request, response.clone()).catch(() => {});
        }
        return response;
      }).catch(() => null);

      if (cached) {
        networkFetch.catch(() => {});
        return cached;
      }

      return (await networkFetch) || Response.error();
    })
  );
});

// Page sends this when the user clicks "Update Now" on the update banner.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
