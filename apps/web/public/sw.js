// Service worker for the installed BMS app.
//
// It deliberately caches nothing but the offline page. Pages and their script files always
// come from the network, so a new deploy reaches users at once and the reload-once recovery for
// removed page files still sees the real network error. When the device is offline, opening a
// page shows offline.html instead of the browser's error screen.
const CACHE = 'bms-offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode !== 'navigate') return;
  event.respondWith(
    fetch(request).catch(() => caches.match(OFFLINE_URL).then((r) => r ?? Response.error())),
  );
});
