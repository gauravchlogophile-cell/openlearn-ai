#!/usr/bin/env node
/** Checks every translation before it can reach a page.
 *
 *  Errors fail the build. They are the things that would put something wrong in front
 *  of a learner: a translation that claims to be reviewed but is not signed, a lesson
 *  that points at English that does not exist, a catalogue with a key the English does
 *  not have, an interface string whose {placeholders} do not match.
 *
 *  Warnings do not fail the build; they are for the reviewer. A translation drifting from
 *  the English in structure (a different number of headings or quizzes) or in its numbers
 *  (a "40" that became "14") is the kind of silent distortion the owner is worried about,
 *  so each one is listed by file, and a reviewer is expected to clear them before signing.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES, liveStatus } from '../src/i18n/locales.js';
import { readState, frontmatterOf } from '../src/i18n/state.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const errors = [];
const warnings = [];
const slash = (p) => p.split('\\').join('/');

const walk = (dir) => {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.mdx')) out.push(p);
  }
  return out;
};
const body = (raw) => raw.replace(/\r\n/g, '\n').replace(/^---\n[\s\S]*?\n---\n?/, '');
const count = (s, re) => (s.match(re) ?? []).length;
const numbers = (s) => (s.replace(/\bhttps?:\S+/g, '').match(/\d+(?:[.,]\d+)?/g) ?? []).sort().join(' ');

const state = readState(ROOT);
const codes = new Set(LOCALES.map((l) => l.code));

/* ---- lessons ---- */
for (const dir of existsSync(join(ROOT, 'content-i18n')) ? readdirSync(join(ROOT, 'content-i18n')) : []) {
  if (!codes.has(dir)) { errors.push(`content-i18n/${dir}: not a language Lrnon is translating into (see src/i18n/locales.js)`); continue; }
  for (const f of walk(join(ROOT, 'content-i18n', dir))) {
    const rel = slash(relative(ROOT, f));
    const raw = readFileSync(f, 'utf8');
    const fm = frontmatterOf(raw);
    if (fm.lang !== dir) errors.push(`${rel}: lang is "${fm.lang}" but the file is under ${dir}/`);
    const enPath = join(ROOT, 'content', `${fm.translationOf}.mdx`);
    if (!fm.translationOf || !existsSync(enPath)) { errors.push(`${rel}: translationOf "${fm.translationOf}" is not an English lesson`); continue; }
    if (!['draft', 'reviewed'].includes(fm.status)) errors.push(`${rel}: status must be draft or reviewed`);
    const english = readFileSync(enPath, 'utf8');
    const verdict = state.languages[dir].lessons.find((x) => x.file === rel);

    if (fm.status === 'reviewed') {
      if (!String(fm.reviewedBy ?? '').trim()) errors.push(`${rel}: marked reviewed but reviewedBy is empty. A translation is reviewed by a named person or it is a draft.`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fm.reviewedOn ?? '')) errors.push(`${rel}: marked reviewed but reviewedOn is not a date`);
      if (verdict && !verdict.live && verdict.why.startsWith('stale')) warnings.push(`${rel}: reviewed, but the English has changed since. It is off the site until it is checked again and re-signed.`);
    }

    // Drift the reviewer must clear: errors on a reviewed file, warnings on a draft.
    const sink = fm.status === 'reviewed' ? errors : warnings;
    const eb = body(english), tb = body(raw);
    if (count(eb, /^## /gm) !== count(tb, /^## /gm)) sink.push(`${rel}: ${count(tb, /^## /gm)} section heading(s) against ${count(eb, /^## /gm)} in the English`);
    if (count(eb, /<Quiz\b/g) !== count(tb, /<Quiz\b/g)) sink.push(`${rel}: ${count(tb, /<Quiz\b/g)} quiz block(s) against ${count(eb, /<Quiz\b/g)} in the English`);
    const q = (s) => count(s, /^\s*answer:\s*\d+/gm);
    if (q(eb) !== q(tb)) sink.push(`${rel}: a different number of quiz questions from the English`);
    const answersEn = (eb.match(/^\s*answer:\s*(\d+)/gm) ?? []).join('|');
    const answersTr = (tb.match(/^\s*answer:\s*(\d+)/gm) ?? []).join('|');
    if (answersEn !== answersTr) sink.push(`${rel}: the correct answers differ from the English (${answersTr} against ${answersEn}). A reordered option moves the right answer; check each one.`);
    if (numbers(eb) !== numbers(tb)) warnings.push(`${rel}: the numbers in the text differ from the English. English: ${numbers(eb) || 'none'}. This: ${numbers(tb) || 'none'}. Check each one against the lesson, because a changed figure changes a claim.`);
    const codeSpans = (s) => (s.match(/`[^`]+`/g) ?? []).sort().join(' ');
    if (codeSpans(eb) !== codeSpans(tb)) warnings.push(`${rel}: code and command text differs from the English. These must be kept exactly.`);
    if (!/import Quiz/.test(tb) && /<Quiz\b/.test(tb)) errors.push(`${rel}: uses <Quiz> without importing it`);
  }
}

/* ---- interface catalogues ---- */
const en = JSON.parse(readFileSync(join(ROOT, 'src/i18n/ui/en.json'), 'utf8'));
const slots = (s) => (String(s).match(/\{\w+\}/g) ?? []).sort().join(',');
for (const l of LOCALES) {
  const f = join(ROOT, 'src/i18n/ui', `${l.code}.json`);
  if (!existsSync(f)) continue;
  const rel = slash(relative(ROOT, f));
  let cat;
  try { cat = JSON.parse(readFileSync(f, 'utf8')); } catch (e) { errors.push(`${rel}: not valid JSON`); continue; }
  const meta = cat._meta ?? {};
  for (const k of Object.keys(cat)) {
    if (k === '_meta') continue;
    if (!(k in en)) { errors.push(`${rel}: "${k}" is not an English string`); continue; }
    if (slots(cat[k]) !== slots(en[k])) errors.push(`${rel}: "${k}" must keep the placeholders ${slots(en[k]) || '(none)'}, has ${slots(cat[k]) || '(none)'}`);
  }
  if (meta.status === 'reviewed') {
    if (!String(meta.reviewedBy ?? '').trim()) errors.push(`${rel}: marked reviewed but reviewedBy is empty`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.reviewedOn ?? '')) errors.push(`${rel}: marked reviewed but reviewedOn is not a date`);
    const missing = Object.keys(en).filter((k) => !(k in cat) || cat[k] === '');
    if (missing.length) errors.push(`${rel}: marked reviewed but ${missing.length} string(s) are missing: ${missing.slice(0, 5).join(', ')}`);
  }
}

for (const w of warnings) console.warn(`  warn  ${w}`);
if (errors.length) {
  console.error(`\ni18n: ${errors.length} error(s)\n` + errors.map((e) => '  ' + e).join('\n'));
  process.exit(1);
}
const files = LOCALES.reduce((n, l) => n + state.languages[l.code].lessons.length, 0);
console.log(`i18n: ${files} translation file(s) and ${LOCALES.filter((l) => existsSync(join(ROOT, 'src/i18n/ui', `${l.code}.json`))).length} interface catalogue(s) checked, ${warnings.length} warning(s), no errors.`);
