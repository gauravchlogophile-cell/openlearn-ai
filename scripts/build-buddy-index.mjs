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
console.log(`buddy index: ${lessons.length} lessons, ${quizzes.length} quizzes, ${(JSON.stringify(index).length / 1024).toFixed(1)} KB`);
