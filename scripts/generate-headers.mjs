#!/usr/bin/env node
/** Generates dist/_headers with a hash-based CSP (Phase 8 §3 A03).
 *  Scans every built HTML file for inline scripts (Astro's island hydration
 *  bootstrap), hashes them, and allows exactly those — nothing else inline.
 *  Runs as the final build step so hashes always match the shipped HTML. */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const DIST = new URL('../dist', import.meta.url).pathname;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.html')) out.push(p);
  }
  return out;
}

const hashes = new Set();
const inlineRe = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
for (const file of walk(DIST)) {
  const html = readFileSync(file, 'utf8');
  for (const m of html.matchAll(inlineRe)) {
    if (m[1].trim() === '') continue;
    hashes.add("'sha256-" + createHash('sha256').update(m[1]).digest('base64') + "'");
  }
}

const scriptSrc = ["'self'", ...hashes].join(' ');
const headers = `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  X-Frame-Options: DENY
  Content-Security-Policy: default-src 'self'; script-src ${scriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.supabase.co; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests

/_astro/*
  Cache-Control: public, max-age=31536000, immutable

/icons/*
  Cache-Control: public, max-age=604800
`;
writeFileSync(join(DIST, '_headers'), headers);
console.log(`_headers written: script-src 'self' + ${hashes.size} inline hash(es).`);
