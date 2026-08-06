/**
 * NADIR service worker.
 *
 * A page whose whole argument is "this works with the radio off" had better
 * work with the radio off. Load it once on the ground and the shell, the
 * fonts and the entire 1.09 MB atlas are on the device; after that the demo
 * runs at 11 km with the wifi you did not buy.
 *
 * Cache-first everywhere it is safe, because none of this changes during a
 * flight and a network round trip you cannot complete is just a delay before
 * failing.
 */

const VERSION = 'nadir-v2';
const SHELL = `${VERSION}-shell`;
const PACK = `${VERSION}-pack`;
const FONTS = `${VERSION}-fonts`;

const KEEP = new Set([SHELL, PACK, FONTS]);

self.addEventListener('install', (event) => {
  // The document and the pack are the two things worth having before anyone
  // asks. The pack used to arrive only when the demo scrolled into view,
  // which is fine on the ground but means a visitor who loads the page and
  // never scrolls boards the flight with an empty atlas. Fetch it here
  // instead, once, on install, so a single page load on wifi is enough.
  event.waitUntil(
    Promise.all([
      caches
        .open(SHELL)
        .then((c) => c.addAll(['/', '/favicon.svg', '/manifest.webmanifest'])),
      caches
        .open(PACK)
        .then((c) => c.add('/pack/world.json')),
    ])
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** Cache first, and only reach for the network on a miss. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  // Opaque responses still cache usefully for fonts; anything else must be ok.
  if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // The atlas. The single most important thing to have offline, and it never
  // changes without a version bump.
  if (url.pathname.startsWith('/pack/')) {
    event.respondWith(cacheFirst(request, PACK));
    return;
  }

  // Fingerprinted build assets are immutable by construction.
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, SHELL));
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request, FONTS));
    return;
  }

  // Documents: try the network so an update is picked up on the ground, but
  // fall back to the cached shell the moment there is no network at all.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/').then((r) => r || Response.error()))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, SHELL));
  }
});
