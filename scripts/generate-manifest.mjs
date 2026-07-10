#!/usr/bin/env node
/** Emits dist/content-manifest.json — lesson counts + content hashes per module.
 *  CI publishes this to the content_manifest table on deploy (release-blocking). */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.mdx')) out.push(p);
  }
  return out;
}
const modules = {};
for (const f of walk(join(ROOT, 'content'))) {
  const rel = relative(join(ROOT, 'content'), f);           // explorer/e1/l1-....mdx
  const [track, mod] = rel.split('/');
  const slug = rel.replace(/\.mdx$/, '');
  const hash = createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 12);
  (modules[`${track}/${mod}`] ??= { track, module: mod, lessons: [] })
    .lessons.push({ slug, hash });
}
const manifest = {
  generatedAt: new Date().toISOString(),
  modules: Object.values(modules).map(m => ({
    ...m, lessonCount: m.lessons.length,
  })),
};
mkdirSync(join(ROOT, 'dist'), { recursive: true });
writeFileSync(join(ROOT, 'dist/content-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Manifest: ${manifest.modules.length} module(s), ` +
  manifest.modules.map(m => `${m.track}/${m.module}=${m.lessonCount}`).join(', '));
