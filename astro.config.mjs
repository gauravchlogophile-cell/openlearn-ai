import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

import cloudflare from "@astrojs/cloudflare";

// Static-first (Phase 4, ADR-0001). Site URL drives canonical tags and the
// sitemap, so the fallback must be a host we actually control: the previous
// default, openlearn-ai.pages.dev, is NOT ours — that Pages project belongs to
// someone else, and any build without PUBLIC_SITE_URL was silently publishing
// a stranger's domain as our canonical URL. Production sets PUBLIC_SITE_URL to
// https://lrnon.org; this fallback just keeps local builds honest.
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'https://lrnon.org',
  output: 'static',

  integrations: [mdx(), react(), sitemap({
    // Neither of these should be advertised to search engines. /admin is not
    // secret — the security is RLS, not obscurity — but there is no reason to
    // invite crawlers into a maintainer console.
    filter: (page) => !page.includes('/offline') && !page.includes('/admin'),
  })],

  /* Styles go inside the page. The stylesheet was a second request that had to finish
     before anything could be drawn, which on a slow connection is a whole round trip
     of staring at a blank page; inlined, the first byte of the page is enough. The
     cost is about five kilobytes compressed per page. */
  build: { inlineStylesheets: 'always' },

  /* Pages are fetched when a link is hovered or focused, so the click that follows
     opens one already on its way. Hover and focus only: nothing is downloaded for a
     link nobody reached for, which matters on a metered connection. */
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  adapter: cloudflare()
});