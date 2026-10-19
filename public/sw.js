/* Drift service worker. Hand-written, no build step.
 *
 * - App shell (main pages) is cached on install, with the /_next/static files those pages use,
 *   so Drift opens with no network and reads the user's data from IndexedDB as usual.
 * - Pages and RSC payloads: stale-while-revalidate.
 * - /_next/static (hashed, immutable) and public assets: cache-first.
 * - /api/* and other origins are never cached or intercepted. User data never passes through here.
 */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'v1';
const PAGES = `drift-pages-${VERSION}`;
const STATIC = `drift-static-${VERSION}`;
const KEEP = [PAGES, STATIC];
const MAX_STATIC = 400;

const SHELL = [
  '/',
  '/home',
  '/timeline',
  '/chosen',
  '/platforms',
  '/ads',
  '/digest',
  '/ask',
  '/connect',
  '/settings',
  '/settings/data',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

const STATIC_FILE = /\.(?:js|css|woff2?|ttf|otf|png|jpe?g|gif|svg|webp|avif|ico|webmanifest|json)$/i;

/** /_next/static URLs referenced by a page's HTML (scripts, styles, fonts). */
function staticRefs(html) {
  const out = new Set();
  const re = /\/_next\/static\/[^"'\s)\\]+/g;
  let m;
  while ((m = re.exec(html))) out.add(m[0]);
  return [...out];
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const pages = await caches.open(PAGES);
    const statics = await caches.open(STATIC);
    const assets = new Set();
    await Promise.all(SHELL.map(async (path) => {
      try {
        const res = await fetch(path, { cache: 'no-cache', credentials: 'same-origin' });
        if (!res.ok) return;
        const isPage = (res.headers.get('content-type') || '').includes('text/html');
        if (isPage) staticRefs(await res.clone().text()).forEach((u) => assets.add(u));
        await (isPage ? pages : statics).put(path, res);
      } catch { /* offline during install: cache what we can */ }
    }));
    await Promise.all([...assets].map(async (u) => {
      try {
        if (await statics.match(u)) return;
        const res = await fetch(u, { credentials: 'same-origin' });
        if (res.ok) await statics.put(u, res);
      } catch { /* skip */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('drift-') && !KEEP.includes(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type === 'basic') {
    await cache.put(request, res.clone());
    trim(STATIC, MAX_STATIC).catch(() => {});
  }
  return res;
}

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · Drift</title>
<style>body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#fff;color:#141414;padding:20px;text-align:center}
@media (prefers-color-scheme:dark){body{background:#111312;color:#EEEFEC}a{color:#86D3C6}}a{color:#0B5D55;font-weight:700}</style></head>
<body><main><h1 style="font-size:24px">You&rsquo;re offline</h1><p>This page hasn&rsquo;t been saved for offline use yet.</p><p><a href="/home">Open your overview</a></p></main></body></html>`;

async function staleWhileRevalidate(event) {
  const { request } = event;
  const cache = await caches.open(PAGES);
  const hit = await cache.match(request, { ignoreVary: true });
  const network = fetch(request).then(async (res) => {
    if (res.ok && res.type === 'basic') await cache.put(request, res.clone());
    return res;
  });
  if (hit) {
    event.waitUntil(network.catch(() => {}));
    return hit;
  }
  try {
    return await network;
  } catch (err) {
    if (request.mode !== 'navigate') throw err;
    const url = new URL(request.url);
    const samePath = await cache.match(url.pathname, { ignoreVary: true, ignoreSearch: true });
    return samePath || new Response(OFFLINE_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/api') return;
  if (url.pathname === '/sw.js') return;
  if (request.headers.get('range')) return;

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.pathname.startsWith('/_next/')) return; // dev/HMR and image endpoints: network only
  if (request.mode === 'navigate' || request.headers.get('RSC') === '1' || url.searchParams.has('_rsc')) {
    event.respondWith(staleWhileRevalidate(event));
    return;
  }
  if (STATIC_FILE.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
