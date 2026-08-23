#!/usr/bin/env node
/** Renders the PNG app icons from public/icons/lrnon-icon.svg.
 *
 *  The PNGs are referenced by manifest.webmanifest for install prompts, home
 *  screens and splash screens, where SVG support is still uneven — so they
 *  cannot simply be deleted in favour of the SVG favicon.
 *
 *  Run after changing the mark:  node scripts/generate-icons.mjs
 *  Not part of `npm run build`: the output is committed, and a build step that
 *  rewrites binary files on every CI run would churn the diff for no reason.
 *
 *  sharp is already present via the Astro/Cloudflare toolchain — no new dep.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ICONS = join(ROOT, 'public/icons');

const src = readFileSync(join(ICONS, 'lrnon-icon.svg'));

/* Maskable icons get cropped to a circle-ish shape by the launcher, which may
   eat the outer 20%. So this variant bleeds the indigo to every edge (no
   corner radius — the launcher supplies its own) and shrinks the arcs into the
   safe zone, rather than reusing the rounded-square art and losing its corners. */
const maskable = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
  <rect width="40" height="40" fill="#3d3d8f"></rect>
  <g transform="translate(20 20) scale(0.66) translate(-20 -20)">
    <path d="M14.93 6.92A12 12 0 0 0 14.93 28.68" fill="none" stroke="#fbf9f5" stroke-width="6" stroke-linecap="round"></path>
    <path d="M25.07 33.08A12 12 0 0 0 25.07 11.32" fill="none" stroke="#f0b27a" stroke-width="6" stroke-linecap="round"></path>
  </g>
</svg>`);

const jobs = [
  ['icon-192.png', src, 192],
  ['icon-512.png', src, 512],
  ['icon-512-maskable.png', maskable, 512],
];

for (const [name, svg, size] of jobs) {
  const out = await sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();
  writeFileSync(join(ICONS, name), out);
  console.log(`${name.padEnd(24)} ${size}x${size}  ${(out.length / 1024).toFixed(1)} kB`);
}
