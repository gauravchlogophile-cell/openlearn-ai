/* OpenLearn AI service worker — Sprint 4.
 * Strategy (Phase 4 §5): app-shell precache · cache-first for hashed assets ·
 * network-first for pages with cache fallback · /offline as last resort.
 * Module packs live in caches named ol-pack-<module> (written by the page,
 * served here). Bump SHELL_V to invalidate the shell. */
const SHELL_V = 'ol-shell-v1';
const ASSETS = 'ol-assets-v1';
const SHELL_URLS = ['/', '/home', '/roadmap', '/achievements', '/account', '/offline'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL_V).then((c) => c.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k.startsWith('ol-shell-') && k !== SHELL_V).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Hashed build assets: cache-first (immutable by filename)
  if (url.pathname.startsWith('/_astro/') || url.pathname.startsWith('/icons/')) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(ASSETS).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  // Pages: network-first, any-cache fallback (shell or module packs), then /offline
  e.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(SHELL_V).then((c) => { if (SHELL_URLS.includes(url.pathname)) c.put(req, copy); });
      return res;
    }).catch(async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      if (req.mode === 'navigate') return caches.match('/offline');
      return Response.error();
    })
  );
});
