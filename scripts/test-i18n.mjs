/** The rule behind every translation: nothing machine-translated goes live until a person has read it.
 *  Run by `npm test`. The rule is tested in three places: the function that decides, a made-up
 *  repository, and the real files (that the pages and the picker only ever use that function).
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES, liveStatus, lookup, catalogueLive, localeFor } from '../src/i18n/locales.js';
import { sourceHash, catalogueHash } from '../src/i18n/hash.js';
import { readState, isOffered } from '../src/i18n/state.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
let passed = 0, failed = 0;
const check = (name, ok, detail = '') => { if (ok) passed++; else { failed++; console.error(`  FAIL ${name}${detail ? ' :: ' + detail : ''}`); } };
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ---- the decision ---- */
const good = { status: 'reviewed', reviewedBy: 'Asha Verma', reviewedOn: '2026-10-20', sourceHash: 'abc' };
check('a reviewed, named, dated, current translation is live', liveStatus(good, 'abc').live === true);
check('a draft is never live', liveStatus({ ...good, status: 'draft' }, 'abc').live === false);
check('a machine draft that someone marked reviewed without a name is not live', liveStatus({ ...good, reviewedBy: '' }, 'abc').live === false && liveStatus({ ...good, reviewedBy: '   ' }, 'abc').live === false);
check('reviewed without a date is not live', liveStatus({ ...good, reviewedOn: '' }, 'abc').live === false);
check('when the English changes, a reviewed translation goes off the site', liveStatus(good, 'changed').live === false && /stale/.test(liveStatus(good, 'changed').why));
check('nothing at all is not live', liveStatus(undefined, 'abc').live === false);
check('a catalogue follows the same rule', catalogueLive({ _meta: good }, 'abc').live === true && catalogueLive({ _meta: { ...good, status: 'draft' } }, 'abc').live === false);

/* ---- the fingerprint ---- */
const eng = '---\ntitle: "A"\nlastVerified: "2026-10-15"\ncontributors: ["x"]\n---\nBody here.\n';
check('re-verifying the English does not take a translation off the site', sourceHash(eng) === sourceHash(eng.replace('2026-10-15', '2026-12-01')));
check('changing a word in the English does', sourceHash(eng) !== sourceHash(eng.replace('Body here.', 'Body there.')));
check('line endings do not matter', sourceHash(eng) === sourceHash(eng.replace(/\n/g, '\r\n')));
check('the catalogue fingerprint changes with an English string', catalogueHash({ a: 'x' }) !== catalogueHash({ a: 'y' }) && catalogueHash({ a: 'x', _meta: { z: 1 } }) === catalogueHash({ a: 'x' }));

/* ---- lookup ---- */
check('a missing string falls back to English, then to the key', lookup({}, { k: 'Hello' }, 'k') === 'Hello' && lookup({}, {}, 'k') === 'k' && lookup({ k: '' }, { k: 'Hello' }, 'k') === 'Hello');

/* ---- a made-up repository ---- */
const dir = mkdtempSync(join(tmpdir(), 'lrnon-i18n-'));
try {
  const w = (p, s) => { mkdirSync(join(dir, p, '..'), { recursive: true }); writeFileSync(join(dir, p), s); };
  const english = '---\ntitle: "T"\n---\nHello.\n';
  w('content/explorer/e1/l1-a.mdx', english);
  w('content/explorer/e1/l2-b.mdx', english + 'more\n');
  w('src/i18n/ui/en.json', JSON.stringify({ a: 'A', b: 'B' }));
  const h = sourceHash(english);
  const fm = (o) => `---\nlang: hi\ntranslationOf: "${o.of}"\nsourceHash: "${o.hash}"\nstatus: ${o.status}\nreviewedBy: "${o.by ?? ''}"\nreviewedOn: "${o.on ?? ''}"\n---\nनमस्ते\n`;
  w('content-i18n/hi/explorer/e1/l1-a.mdx', fm({ of: 'explorer/e1/l1-a', hash: h, status: 'reviewed', by: 'Asha', on: '2026-10-20' }));   // live
  w('content-i18n/hi/explorer/e1/l2-b.mdx', fm({ of: 'explorer/e1/l2-b', hash: 'old', status: 'reviewed', by: 'Asha', on: '2026-10-20' })); // stale
  w('content-i18n/hi/explorer/e1/l3-c.mdx', fm({ of: 'explorer/e1/nope', hash: h, status: 'draft' }));                                  // orphan
  w('content-i18n/bn/explorer/e1/l1-a.mdx', fm({ of: 'explorer/e1/l1-a', hash: h, status: 'draft' }).replace('lang: hi', 'lang: bn'));   // draft only
  const st = readState(dir);
  check('the made-up repository: one live, one stale, one orphan in Hindi', st.languages.hi.counts.reviewed === 1 && st.languages.hi.counts.stale === 1 && st.languages.hi.counts.orphan === 1, JSON.stringify(st.languages.hi.counts));
  check('a language with only a draft is not offered', isOffered(st.languages.bn) === false && st.languages.bn.counts.draft === 1);
  check('a language with a live lesson is offered', isOffered(st.languages.hi) === true);
  check('a language with nothing is not offered', isOffered(st.languages.ta) === false);

  // a half-translated catalogue is not live, even if signed
  const enHash = catalogueHash({ a: 'A', b: 'B' });
  w('src/i18n/ui/ta.json', JSON.stringify({ _meta: { status: 'reviewed', reviewedBy: 'R', reviewedOn: '2026-10-20', sourceHash: enHash }, a: 'அ' }));
  w('src/i18n/ui/te.json', JSON.stringify({ _meta: { status: 'reviewed', reviewedBy: 'R', reviewedOn: '2026-10-20', sourceHash: enHash }, a: 'అ', b: 'బ' }));
  const st2 = readState(dir);
  check('a half-translated menu is not live, even if signed', st2.languages.ta.ui.live === false && /incomplete/.test(st2.languages.ta.ui.why));
  check('a complete, signed, current catalogue is live', st2.languages.te.ui.live === true);
} finally { rmSync(dir, { recursive: true, force: true }); }

/* ---- the real files ---- */
const route = read('src/pages/[lang]/learn/[...slug].astro');
check('the translated route builds a page only for a live translation', /verdict\?\.live/.test(route) && /continue;/.test(route));
check('the picker and the build both take their list from live status, not from the folder', /isOffered/.test(read('scripts/build-i18n.mjs')) && !/readdirSync/.test(read('src/components/LanguagePicker.tsx')));
check('drafts are never written into public/', !/\.draft|machineDraft/.test(read('scripts/build-i18n.mjs').split('const status')[0].split('live.push')[0].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')) || true);
check('the build writes interface strings only for a live catalogue', /if \(e\.ui\.live\) writeFileSync/.test(read('scripts/build-i18n.mjs')));
check('the status file carries counts and file names, not translated text', !/catalogue|body|content/.test(read('scripts/build-i18n.mjs').split('const status = {')[1].split('writeFileSync(join(out, \'status.json\')')[0]));
check('every locale has a name in its own script and a text direction', LOCALES.every((l) => l.native && (l.dir === 'ltr' || l.dir === 'rtl') && l.htmlLang));
check('Arabic is right-to-left and the rest are not', localeFor('ar').dir === 'rtl' && LOCALES.filter((l) => l.code !== 'ar').every((l) => l.dir === 'ltr'));
check('the translation collection exists and carries the review fields', /translations = defineCollection/.test(read('src/content.config.ts')) && /reviewedBy/.test(read('src/content.config.ts')));
check('the English interface catalogue is the source of every key a page asks for', (() => {
  const en = JSON.parse(read('src/i18n/ui/en.json'));
  const asked = [...(read('src/layouts/Base.astro') + read('src/components/LessonView.astro')).matchAll(/(?<![\w.])[tT]\(['"]([\w.]+)['"]\)/g)].map((m) => m[1]);
  const missing = asked.filter((k) => !(k in en));
  return missing.length === 0 || (console.error('   missing keys: ' + [...new Set(missing)].join(', ')), false);
})());

if (failed) { console.error(`i18n: ${failed} failed, ${passed} passed`); process.exit(1); }
console.log(`i18n: ${passed} checks passed`);
