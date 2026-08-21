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
    filter: (page) => !page.includes('/offline'),
  })],

  build: { inlineStylesheets: 'auto' },
  adapter: cloudflare()
});