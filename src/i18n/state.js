/** What is translated, and how far each translation has got. Build-time only.
 *
 *  It reads the repository: the English lessons in content/, the translations in
 *  content-i18n/<lang>/, and the interface catalogues in src/i18n/ui/. It decides
 *  nothing about what a reader sees except through liveStatus() in locales.js, so
 *  the rule "only reviewed, named, up-to-date translations are shown" lives in one
 *  place and the build script, the Astro routes and the tests all use it.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { LOCALES, liveStatus, catalogueLive } from './locales.js';
import { sourceHash, catalogueHash } from './hash.js';

const walk = (dir, ext) => {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, ext));
    else if (p.endsWith(ext)) out.push(p);
  }
  return out;
};
const slash = (p) => p.split('\\').join('/');

/** The handful of flat frontmatter keys this needs, without a YAML parser.
 *  @param {string} raw */
export function frontmatterOf(raw) {
  const m = String(raw).replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---/);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split('\n')) {
    const k = line.match(/^(lang|translationOf|sourceHash|status|machineDraft|reviewedBy|reviewedOn|title):\s*(.*)$/);
    if (k) out[k[1]] = k[2].trim().replace(/^"|"$/g, '').replace(/\s+#.*$/, '');
  }
  return out;
}

/** @param {string} root the repository root */
export function readState(root) {
  const contentDir = join(root, 'content');
  const english = new Map();                    // id -> {hash, file}
  for (const f of walk(contentDir, '.mdx')) {
    const id = slash(relative(contentDir, f)).replace(/\.mdx$/, '');
    english.set(id, { hash: sourceHash(readFileSync(f, 'utf8')), file: f });
  }

  const enUi = JSON.parse(readFileSync(join(root, 'src/i18n/ui/en.json'), 'utf8'));
  const enUiHash = catalogueHash(enUi);

  const languages = {};
  for (const l of LOCALES) {
    const entry = { code: l.code, ui: { status: 'missing', live: false, why: 'no catalogue yet', missing: [] }, lessons: [], counts: { reviewed: 0, draft: 0, stale: 0, orphan: 0 } };

    const uiFile = join(root, 'src/i18n/ui', `${l.code}.json`);
    if (existsSync(uiFile)) {
      const cat = JSON.parse(readFileSync(uiFile, 'utf8'));
      const verdict = catalogueLive(cat, enUiHash);
      const missing = Object.keys(enUi).filter((k) => k !== '_meta' && !(typeof cat[k] === 'string' && cat[k] !== ''));
      // A catalogue that does not cover every English string is not live: a half-translated menu is worse than English.
      const complete = missing.length === 0;
      entry.ui = { status: cat._meta?.status ?? 'draft', live: verdict.live && complete, why: complete ? verdict.why : `incomplete: ${missing.length} string(s) missing`, missing, reviewedBy: cat._meta?.reviewedBy || '', reviewedOn: cat._meta?.reviewedOn || '', strings: Object.keys(cat).filter((k) => k !== '_meta').length };
      entry.catalogue = cat;
    }

    for (const f of walk(join(root, 'content-i18n', l.code), '.mdx')) {
      const fm = frontmatterOf(readFileSync(f, 'utf8'));
      const id = fm.translationOf || '';
      const src = english.get(id);
      let verdict;
      if (!src) verdict = { live: false, why: 'orphan: the English lesson it translates does not exist' };
      else verdict = liveStatus(fm, src.hash);
      const state = !src ? 'orphan' : verdict.live ? 'reviewed' : verdict.why.startsWith('stale') ? 'stale' : 'draft';
      entry.counts[state]++;
      entry.lessons.push({ id, file: slash(relative(root, f)), state, live: verdict.live, why: verdict.why, reviewedBy: fm.reviewedBy || '', reviewedOn: fm.reviewedOn || '', currentHash: src?.hash ?? '' });
    }
    languages[l.code] = entry;
  }
  return { english: [...english.keys()].sort(), englishHashes: Object.fromEntries([...english].map(([k, v]) => [k, v.hash])), enUiHash, languages };
}

/** Is this language worth offering? It must have a live interface catalogue or at least one live lesson. */
export const isOffered = (entry) => entry.ui.live || entry.counts.reviewed > 0;
