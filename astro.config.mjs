import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// Static-first (Phase 4, ADR-0001). Site URL: set PUBLIC_SITE_URL in your
// host's env once you have a domain; the pages.dev fallback keeps sitemap
// and canonical URLs valid on first deploy.
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'https://openlearn-ai.pages.dev',
  output: 'static',
  integrations: [mdx(), react(), sitemap({
    filter: (page) => !page.includes('/offline'),
  })],
  build: { inlineStylesheets: 'auto' },
});
