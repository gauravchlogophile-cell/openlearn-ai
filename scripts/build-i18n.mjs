#!/usr/bin/env node
/** Translation build step and the small tools a reviewer needs.
 *
 *    node scripts/build-i18n.mjs                    writes what the site reads (runs before every build)
 *    node scripts/build-i18n.mjs status             prints where every language stands
 *    node scripts/build-i18n.mjs stamp <file|ui:xx> fills in sourceHash from the English as it is now
 *    node scripts/build-i18n.mjs review <file|ui:xx> "Name"
 *                                                   after you have READ it: marks it reviewed by you, today
 *
 *  What the build writes, all under public/i18n/ (not committed):
 *    live.json        the languages a learner may pick, and what each offers
 *    <lang>.json      the interface strings of every language whose catalogue is live
 *    status.json      counts and file names for the translators' desk. No translated text.
 *
 *  A draft's text is never written there. Drafts stay in content-i18n/ and src/i18n/ui/
 *  for a reviewer, and only reach a page by passing liveStatus() in src/i18n/locales.js.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES } from '../src/i18n/locales.js';
import { readState, isOffered, frontmatterOf } from '../src/i18n/state.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const today = () => new Date().toISOString().slice(0, 10);

function targetFor(arg) {
  if (!arg) throw new Error('give a file, or ui:<lang> for an interface catalogue');
  if (arg.startsWith('ui:')) return { ui: true, file: join(ROOT, 'src/i18n/ui', `${arg.slice(3)}.json`) };
  return { ui: false, file: join(ROOT, arg) };
}

function setFields(t, state, fields) {
  const raw = readFileSync(t.file, 'utf8');
  if (t.ui) {
    const cat = JSON.parse(raw);
    cat._meta = { ...(cat._meta ?? {}), ...fields };
    writeFileSync(t.file, JSON.stringify(cat, null, 2) + '\n');
    return;
  }
  let text = raw.replace(/\r\n/g, '\n');
  for (const [k, v] of Object.entries(fields)) {
    const re = new RegExp(`^${k}:.*$`, 'm');
    const line = `${k}: ${typeof v === 'boolean' ? v : JSON.stringify(v)}`;
    if (re.test(text)) text = text.replace(re, () => line);
    else text = text.replace(/^---\n/, () => `---\n${line}\n`);
  }
  writeFileSync(t.file, text);
}

const [, , cmd, a1, a2] = process.argv;

if (cmd === 'stamp' || cmd === 'review') {
  const st = readState(ROOT);
  const t = targetFor(a1);
  let hash;
  if (t.ui) hash = st.enUiHash;
  else {
    const id = frontmatterOf(readFileSync(t.file, 'utf8')).translationOf;
    hash = st.englishHashes[id];
    if (!hash) { console.error(`No English lesson called "${id}".`); process.exit(1); }
  }
  if (cmd === 'stamp') {
    setFields(t, st, { sourceHash: hash });
    console.log(`stamped ${a1} with the English as it is today (${hash}).`);
  } else {
    if (!a2 || a2.trim().length < 3) { console.error('Say who read it: node scripts/build-i18n.mjs review <file> "Your name"'); process.exit(1); }
    setFields(t, st, { sourceHash: hash, status: 'reviewed', machineDraft: false, reviewedBy: a2.trim(), reviewedOn: today() });
    console.log(`${a1} is now marked reviewed by ${a2.trim()} on ${today()}. It goes live on the next build.`);
    console.log('Only do this after reading every line against the English. The build trusts it.');
  }
  process.exit(0);
}

const state = readState(ROOT);

if (cmd === 'status') {
  for (const l of LOCALES) {
    const e = state.languages[l.code];
    console.log(`${l.code.padEnd(3)} ${l.name.padEnd(22)} interface: ${e.ui.live ? 'live' : e.ui.why}; lessons: ${e.counts.reviewed} live, ${e.counts.draft} draft, ${e.counts.stale} stale of ${state.english.length}`);
  }
  process.exit(0);
}

const out = join(ROOT, 'public/i18n');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const live = [];
for (const l of LOCALES) {
  const e = state.languages[l.code];
  if (e.ui.live) writeFileSync(join(out, `${l.code}.json`), JSON.stringify(e.catalogue));
  if (isOffered(e)) live.push({ code: l.code, htmlLang: l.htmlLang, name: l.name, native: l.native, dir: l.dir, ui: e.ui.live, lessons: e.counts.reviewed });
}
writeFileSync(join(out, 'live.json'), JSON.stringify({ languages: live }));

const status = {
  totalLessons: state.english.length,
  languages: Object.fromEntries(LOCALES.map((l) => {
    const e = state.languages[l.code];
    return [l.code, {
      name: l.name, native: l.native,
      ui: { live: e.ui.live, status: e.ui.status, why: e.ui.why, reviewedBy: e.ui.reviewedBy ?? '', reviewedOn: e.ui.reviewedOn ?? '' },
      counts: e.counts,
      lessons: e.lessons.map((x) => ({ id: x.id, file: x.file, state: x.state, why: x.why, reviewedBy: x.reviewedBy, reviewedOn: x.reviewedOn })),
    }];
  })),
};
writeFileSync(join(out, 'status.json'), JSON.stringify(status));

const liveNames = live.map((l) => l.code).join(', ') || 'none';
const drafts = LOCALES.reduce((n, l) => n + state.languages[l.code].counts.draft, 0);
console.log(`i18n: ${live.length} language(s) live (${liveNames}); ${drafts} lesson draft(s) waiting for a reviewer, none published.`);
