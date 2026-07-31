/*
 * Wingman's service worker: the bare minimum that makes the installed app
 * open instantly and survive a flaky connection.
 *
 * It only ever touches same-origin GETs. Every request Wingman exists to make
 * (the calls to the gateway or provider you typed) is cross-origin and goes
 * straight to the network, untouched and uncached. Keeping keys and responses
 * out of the cache is the whole point: nothing Wingman holds should outlive
 * the tab.
 *
 * This file is a build input, not a served one: vite.config.ts fills in the
 * two placeholders below and emits the result as `dist/sw.js`. That is also
 * what makes updates work: every build produces different bytes, and
 * different bytes are what tell the browser to install a new worker.
 */

/** The app version plus a hash of this build's assets. Replaced at build time. */
const BUILD_ID = '__BUILD_ID__';

/** This build's hashed JS and CSS, its fonts and its icons. Replaced at build time. */
const PRECACHE = ['__PRECACHE__'];

const CACHE = `wingman-${BUILD_ID}`;

/* Warmed at install so the first offline launch has everything it needs to
   draw. The app is client-rendered, so the JS is as load-bearing as the HTML,
   and the fonts and provider logos are what keep an offline launch from
   looking broken rather than merely disconnected. */
const SHELL = ['/', '/favicon.svg', '/manifest.webmanifest', ...PRECACHE];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // A single missing entry must not fail the whole install.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
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
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Anything not served by Wingman itself (providers, gateways, analytics)
  // is none of the worker's business.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/_vercel/')) return;

  // Navigations: fresh HTML when online, the cached shell when not. Wingman is
  // a single route, so that one entry is every navigation there is to answer.
  // Unknown paths 404 from the host rather than being rewritten to `/`.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          void put(request, response.clone());
          return response;
        })
        .catch(async () => (await match('/')) ?? Response.error()),
    );
    return;
  }

  // Assets: serve from cache, and refresh it in the background so the next
  // load has the newer file without ever blocking on the network.
  event.respondWith(
    match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          void put(request, response.clone());
          return response;
        })
        .catch(() => cached ?? Response.error());
      return cached ?? network;
    }),
  );
});

/**
 * Look a request up in the cache, `Vary` and all.
 *
 * Hosts label static files `Vary: Origin` (Vercel and Vite's own preview
 * server both do), and the precache fetches them without an `Origin` while the
 * page asks for its module scripts with one, so a strict match misses every
 * entry that matters and the app comes up blank offline. Everything in here is
 * one of Wingman's own files, served one way to everybody, so there is no
 * second representation for `Vary` to be protecting.
 */
function match(request) {
  return caches.match(request, { ignoreVary: true });
}

/** Store a response, but only a complete one. A 206 or an opaque error is worse than nothing. */
async function put(request, response) {
  if (!response.ok || response.status !== 200 || response.type !== 'basic') return;
  const cache = await caches.open(CACHE);
  await cache.put(request, response);
}
