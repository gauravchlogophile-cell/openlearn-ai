#!/usr/bin/env node
/**
 * If the app shell changed, SHELL_V must change with it.
 *
 * public/sw.js precaches the HTML of /, /home, /roadmap, /achievements and
 * /account. That HTML embeds Base.astro and every island it renders — so a
 * change to any of them means a returning visitor can be holding a shell that
 * references a superseded bundle.
 *
 * The file already said "Bump SHELL_V to invalidate the shell". It was not
 * bumped across five changes to the Sky island, and the resulting symptom was
 * genuinely hard to read: the dock rendered from the cached bundle but did not
 * attach an access token, so the route saw an anonymous request and refused.
 * That looks exactly like a broken login, and nothing points at the cache.
 *
 * A rule in a comment is a rule until someone is busy. This makes it fail.
 */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LAYOUT = 'src/layouts/Base.astro';
const RECORD = 'public/.shell-fingerprint';

/** Base.astro plus every local file it imports — the shell's real inputs,
 *  discovered rather than listed, so adding an island cannot silently escape
 *  the check. */
function shellInputs() {
  const seen = new Set();
  const walk = (rel) => {
    if (seen.has(rel) || !existsSync(join(ROOT, rel))) return;
    seen.add(rel);
    const src = readFileSync(join(ROOT, rel), 'utf8');
    for (const m of src.matchAll(/from\s+['"](\.\.?\/[^'"]+)['"]/g)) {
      let target = resolve(dirname(rel), m[1]).replace(ROOT, '').replace(/\\/g, '/');
      target = target.replace(/^\/+/, '');
      for (const ext of ['', '.ts', '.tsx', '.js', '.astro']) {
        if (existsSync(join(ROOT, target + ext))) { walk(target + ext); break; }
      }
    }
  };
  walk(LAYOUT);
  return [...seen].sort();
}

const inputs = shellInputs();
const hash = createHash('sha256');
for (const rel of inputs) hash.update(readFileSync(join(ROOT, rel)));
const fingerprint = hash.digest('hex').slice(0, 16);

const sw = readFileSync(join(ROOT, 'public/sw.js'), 'utf8');
const shellV = sw.match(/const SHELL_V = '([^']+)'/)?.[1];

if (!shellV) {
  console.error('shell-version: could not find SHELL_V in public/sw.js');
  process.exit(1);
}

const recorded = existsSync(join(ROOT, RECORD))
  ? readFileSync(join(ROOT, RECORD), 'utf8').trim()
  : '';
const expected = `${shellV} ${fingerprint}`;

if (recorded !== expected) {
  const [wasV, wasHash] = recorded.split(/\s+/);
  if (wasHash && wasHash !== fingerprint && wasV === shellV) {
    console.error(
      `\nshell-version: the app shell changed but SHELL_V did not.\n\n` +
      `  SHELL_V is still ${shellV}\n` +
      `  shell fingerprint ${wasHash} -> ${fingerprint}\n\n` +
      `A returning visitor can hold a precached shell pointing at the old\n` +
      `bundle. Bump SHELL_V in public/sw.js, then record it:\n\n` +
      `  node scripts/test-shell-version.mjs --write\n\n` +
      `Shell inputs (${inputs.length}):\n` +
      inputs.map((i) => '  ' + i).join('\n') + '\n');
    process.exit(1);
  }
  if (process.argv.includes('--write')) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(ROOT, RECORD), expected + '\n');
    console.log(`shell-version: recorded ${expected}`);
    process.exit(0);
  }
  console.error(
    `\nshell-version: no recorded fingerprint for ${shellV}.\n` +
    `Run: node scripts/test-shell-version.mjs --write\n`);
  process.exit(1);
}

console.log(`shell-version: ${shellV} matches the shell (${inputs.length} inputs)`);
