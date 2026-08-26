#!/usr/bin/env node
/**
 * Builds Sky's retrieval index from this site's own content.
 *
 * This file is what makes "answers only from Lrnon pages" enforceable rather
 * than a promise in a system prompt. Sky retrieves from here; if nothing
 * clears the relevance floor it refuses. A model cannot cite a page that is
 * not in this index, and it is never given the open web.
 *
 * Sections, not whole pages: a lesson is 1,000 words and quoting all of it to
 * answer one question wastes budget and buries the actual source. Each chunk
 * keeps the heading it came from, so a citation can deep-link to the section
 * a learner should read rather than the top of the page.
 *
 *   node scripts/build-sky-index.mjs
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function walk(dir, ext) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, ext));
    else if (p.endsWith(ext)) out.push(p);
  }
  return out;
}

/** Strip MDX to prose: frontmatter, imports and JSX islands go, because a
 *  quiz's options are not an answer to anything and would be cited as if they
 *  were the lesson's claim. */
function mdxProse(src) {
  return src
    .replace(/^---\r?\n[\s\S]*?\r?\n---/, '')
    .replace(/^import .*$/gm, '')
    .replace(/<[A-Z][\s\S]*?\/>/g, ' ')
    .replace(/<[A-Z][a-zA-Z]*[\s\S]*?<\/[A-Z][a-zA-Z]*>/g, ' ')
    .replace(/\r\n/g, '\n');
}

/** Split on markdown headings so each chunk carries its own section title. */
function sections(text) {
  const out = [];
  let heading = null, buf = [];
  for (const line of text.split('\n')) {
    const h = line.match(/^#{2,3}\s+(.*)$/);
    if (h) {
      if (buf.join(' ').trim()) out.push({ heading, body: buf.join(' ').trim() });
      heading = h[1].trim(); buf = [];
    } else buf.push(line);
  }
  if (buf.join(' ').trim()) out.push({ heading, body: buf.join(' ').trim() });
  return out;
}

const clean = (s) => s.replace(/[*_`>#\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const chunks = [];

// ---- lessons -------------------------------------------------------------
for (const file of walk(join(ROOT, 'content'), '.mdx')) {
  const rel = relative(join(ROOT, 'content'), file).split(sep).join('/');
  const src = readFileSync(file, 'utf8');
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const title = fm?.[1].match(/^title:\s*"?(.*?)"?\s*$/m)?.[1] ?? rel;
  const slug = rel.replace(/\.mdx$/, '');
  for (const s of sections(mdxProse(src))) {
    const body = clean(s.body);
    if (body.length < 120) continue;      // too short to answer anything
    chunks.push({
      id: `${slug}#${slugify(s.heading ?? 'intro')}`,
      url: `/learn/${slug}${s.heading ? '#' + slugify(s.heading) : ''}`,
      title, heading: s.heading, text: body, kind: 'lesson',
    });
  }
}

// ---- policy and project pages -------------------------------------------
// Deliberately NOT community rooms or Ask Doubts: those are learner-written,
// so quoting them would let one learner's mistake come back to another with
// the site's voice behind it.
const pages = [
  ['privacy', '/privacy', 'Privacy'],
  ['terms', '/terms', 'Terms of use'],
  ['volunteer', '/volunteer', 'Volunteer'],
  ['support', '/support', 'Support Lrnon'],
  ['feedback', '/feedback', 'Feedback & complaints'],
  ['share', '/share', 'Spread the word'],
  ['community', '/community', 'Community'],
];
for (const [name, url, title] of pages) {
  const p = join(ROOT, 'src/pages', name + '.astro');
  let src;
  try { src = readFileSync(p, 'utf8'); } catch { continue; }
  const body = src
    .replace(/^---[\s\S]*?---/, '')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')          // drop expressions, keep prose
    .replace(/<[^>]+>/g, ' ');
  const text = clean(body);
  // One chunk per ~700 characters, on sentence boundaries.
  let cur = '';
  for (const sentence of text.split(/(?<=\.)\s+/)) {
    if ((cur + ' ' + sentence).length > 700 && cur.length > 200) {
      chunks.push({ id: `${name}#${chunks.length}`, url, title, heading: null, text: cur.trim(), kind: 'page' });
      cur = sentence;
    } else cur += ' ' + sentence;
  }
  if (cur.trim().length > 200) {
    chunks.push({ id: `${name}#${chunks.length}`, url, title, heading: null, text: cur.trim(), kind: 'page' });
  }
}

/* ------------------------------------------------------- assessment guard
 *
 * Sky must not answer a question a learner is currently being assessed on.
 *
 * Scrubbing quiz text from the index would not achieve this and would gut
 * Sky's usefulness: a quiz tests what the lesson taught, so the lesson
 * necessarily contains the answer in prose. Measured — seven module-quiz
 * options and one stem appear verbatim in lesson text, correctly.
 *
 * So the guard works the other way round. Every question stem, from both the
 * module banks and the inline lesson quizzes, is collected here; the route
 * compares an incoming question against them and refuses a near match. A
 * learner asking the underlying CONCEPT in their own words still gets taught,
 * which is the point of the site; a learner pasting the question does not.
 */
const quiz = [];

for (const p of walk(join(ROOT, 'content/quizzes'), '.json')) {
  const bank = JSON.parse(readFileSync(p, 'utf8'));
  for (const it of bank.items ?? []) {
    quiz.push({ q: clean(it.q), module: bank.module, source: 'bank' });
  }
}

/* Certification assessment items. These matter more than the rest of this
   guard, not less: a spoiled lesson quiz costs a learner some practice, and a
   spoiled assessment question costs a certificate its meaning — and the
   certificate is the thing someone might show an employer. Collected first so a
   missing directory fails loudly here rather than silently leaving the
   highest-stakes questions unprotected. */
for (const p of walk(join(ROOT, 'content/assessments'), '.json')) {
  const bank = JSON.parse(readFileSync(p, 'utf8'));
  for (const it of bank.items ?? []) {
    quiz.push({ q: clean(it.q), module: bank.module, source: 'assessment' });
  }
}

for (const file of walk(join(ROOT, 'content'), '.mdx')) {
  const src = readFileSync(file, 'utf8');
  const rel = relative(join(ROOT, 'content'), file).split(sep).join('/');
  const mod = src.match(/^module:\s*(.+)$/m)?.[1].trim() ?? null;
  // Inline <Quiz items={[...]}> entries, which are the ones a learner meets
  // mid-lesson and is most likely to paste.
  for (const m of src.matchAll(/q:\s*"((?:[^"\\]|\\.)+)"/g)) {
    quiz.push({ q: clean(m[1].replace(/\\"/g, '"')), module: mod, lesson: rel.replace(/\.mdx$/, ''), source: 'inline' });
  }
}

mkdirSync(join(ROOT, 'src/generated'), { recursive: true });
writeFileSync(
  join(ROOT, 'src/generated/sky-index.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), chunks }, null, 0) + '\n'
);
writeFileSync(
  join(ROOT, 'src/generated/sky-quizbank.json'),
  JSON.stringify({ generatedAt: new Date().toISOString(), quiz }, null, 0) + '\n'
);
console.log(`Assessment guard: ${quiz.length} quiz stems (${quiz.filter(q => q.source === 'bank').length} bank, ${quiz.filter(q => q.source === 'inline').length} inline, ${quiz.filter(q => q.source === 'assessment').length} certification)`);

const byKind = chunks.reduce((a, c) => ({ ...a, [c.kind]: (a[c.kind] ?? 0) + 1 }), {});
console.log(`Sky index: ${chunks.length} chunks (${Object.entries(byKind).map(([k, v]) => `${k}=${v}`).join(', ')})`);
