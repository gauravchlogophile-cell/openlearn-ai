#!/usr/bin/env node
/**
 * A small index for the Sky companion: which lessons exist, how long each takes,
 * how many review cards each carries, and which modules have a quiz.
 *
 * The companion shows up on every page, so it cannot afford to ship the whole
 * lesson list in the page itself (about 200 lessons would add to every
 * download). This is fetched once, after the page is idle, and is a few
 * kilobytes. It contains no prose and nothing about any learner: progress lives
 * in the browser and is combined with this there.
 *
 *   node scripts/build-buddy-index.mjs   ->   public/buddy-index.json
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
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

const modules = JSON.parse(readFileSync(join(ROOT, 'content/modules.json'), 'utf8')).modules;
const live = new Map(modules.filter((m) => m.status === 'live').map((m) => [m.id, m.title]));

const lessons = [];
for (const file of walk(join(ROOT, 'content'), '.mdx')) {
  const src = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const fm = src.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  const get = (k) => fm.match(new RegExp('^' + k + ':\\s*"?(.*?)"?\\s*$', 'm'))?.[1];
  const module = get('module');
  if (!live.has(module)) continue;                       // planned modules have nothing to open
  const cards = (fm.match(/^\s+- front:/gm) ?? []).length;
  lessons.push({
    s: relative(join(ROOT, 'content'), file).split(sep).join('/').replace(/\.mdx$/, ''),
    t: get('title'),
    m: module,
    o: Number(get('order')),
    min: Number(get('minutes')),
    c: cards,
  });
}
lessons.sort((a, b) => a.m.localeCompare(b.m, 'en', { numeric: true }) || a.o - b.o);

const quizzes = readdirSync(join(ROOT, 'content/quizzes'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(ROOT, 'content/quizzes', f), 'utf8')).module)
  .sort();

const index = {
  v: 1,
  modules: Object.fromEntries(live),
  quizzes,
  lessons,
};
writeFileSync(join(ROOT, 'public/buddy-index.json'), JSON.stringify(index));

/* The two things Sky's in-panel practice needs, split by module so the browser
   fetches only the module it is about to use (a few kilobytes), never all of it:
     public/buddy/quiz-<module>.json   questions for the five-question quick quiz
     public/buddy/cards-<module>.json  flashcards for the in-panel review
   Both are copies of content that is already public; nothing about a learner. */
import { mkdirSync } from 'node:fs';
mkdirSync(join(ROOT, 'public/buddy'), { recursive: true });
let nq = 0, nc = 0;
for (const m of quizzes) {
  const bank = JSON.parse(readFileSync(join(ROOT, 'content/quizzes', m + '.json'), 'utf8'));
  const items = (bank.items ?? []).map((i) => ({ id: i.id, q: i.q, o: i.options, a: i.answer, why: i.explain }));
  writeFileSync(join(ROOT, 'public/buddy', 'quiz-' + m + '.json'), JSON.stringify({ module: m, title: bank.title, items }));
  nq += items.length;
}
for (const mod of live.keys()) {
  const cards = [];
  for (const file of walk(join(ROOT, 'content'), '.mdx')) {
    const src = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const fm = src.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    if (fm.match(/^module:\s*"?(.*?)"?\s*$/m)?.[1] !== mod) continue;
    const slug = relative(join(ROOT, 'content'), file).split(sep).join('/').replace(/\.mdx$/, '');
    const title = fm.match(/^title:\s*"?(.*?)"?\s*$/m)?.[1];
    const fcs = [...fm.matchAll(/^\s+- front:\s*"(.*)"\s*\n\s+back:\s*"(.*)"\s*$/gm)];
    fcs.forEach((c, i) => cards.push({ k: slug + '#' + i, f: c[1].replace(/\\"/g, '"'), b: c[2].replace(/\\"/g, '"'), t: title, s: slug }));
  }
  writeFileSync(join(ROOT, 'public/buddy', 'cards-' + mod + '.json'), JSON.stringify({ module: mod, cards }));
  nc += cards.length;
}
console.log(`buddy practice data: ${nq} quiz questions, ${nc} cards`);
console.log(`buddy index: ${lessons.length} lessons, ${quizzes.length} quizzes, ${(JSON.stringify(index).length / 1024).toFixed(1)} KB`);
