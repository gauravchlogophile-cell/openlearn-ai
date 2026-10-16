/* Lrnon service worker — Sprint 4.
 * Strategy (Phase 4 §5): app-shell precache · cache-first for hashed assets ·
 * network-first for pages with cache fallback · /offline as last resort.
 * Module packs live in caches named ol-pack-<module> (written by the page,
 * served here). Bump SHELL_V to invalidate the shell. */
/* v5 — the Sky island changed five times across the audience, kill-switch and
   diagnostic work, and it lives inside every page in SHELL_URLS below. The
   rule at the top of this file exists for exactly that and was not followed:
   a returning visitor could hold a precached shell referencing the old bundle,
   which does not attach an access token, so the route sees an anonymous
   request and refuses — while the dock still renders. That is precisely the
   symptom that was reported, and it is indistinguishable from a broken login
   unless you know to suspect the cache. */
/* v9 — Sky became the companion on every page (SkyBuddy replaces the dock), the
   footer and landing page changed with the funding policy, and sky.css and the
   Sky colour tokens joined the shell. A returning visitor holding the v8 shell
   would see the old dock and the old "no ads" footer until it refreshed. */
/* v12 — the header gained a language picker and translatable words, Sky gained sound and voice, the phone sheet was fixed. *//* v11 — pages open faster: navigation preload starts the page request while this
   worker is still waking, and Sky's small avatar replaces a 37 KB picture that was
   fetched on every page. The fab, the shell and the headers all changed. */
const SHELL_V = 'ol-shell-v12';
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
    )).then(() => (self.registration.navigationPreload ? self.registration.navigationPreload.enable() : undefined))
      .then(() => self.clients.claim())
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
    Promise.resolve(e.preloadResponse).then((pre) => pre || fetch(req)).then((res) => {
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
