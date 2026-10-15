#!/usr/bin/env node
/**
 * Source watcher — detects when a vendor's documentation actually CHANGES.
 *
 * The staleness SLA in validate-content.mjs is calendar-driven: it says
 * "re-verify everything every 90 days" whether or not anything moved. That
 * caught the NotebookLM rename six weeks late, because nothing was watching
 * the source — only the clock.
 *
 * This watches the source. It fetches each registry card's docsUrl, reduces
 * the page to readable text, and compares a fingerprint against the last run.
 * When a page moves, it names which one and by how much.
 *
 * What it deliberately does NOT do is rewrite lesson content from a vendor
 * page. A diff means "a human should look", not "the machine may edit the
 * curriculum". Unchecked machine output is exactly what /volunteer tells
 * contributors is worse than nothing, and that rule applies hardest to us.
 *
 *   node scripts/check-sources.mjs            # report only
 *   node scripts/check-sources.mjs --update   # rewrite the fingerprint file
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REG = join(ROOT, 'registry');
const STORE = join(REG, '_fingerprints.json');
const UPDATE = process.argv.includes('--update');

/** Strip a page down to the words a reader would actually see. Nav, scripts,
 *  styles and inline SVG are dropped because they churn without meaning. */
function readableText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Jaccard similarity over the word set. Insensitive to reordering and to a
 *  changed timestamp; sensitive to a product being renamed or a section going
 *  away, which is what we care about. */
function similarity(aWords, bWords) {
  const a = new Set(aWords), b = new Set(bWords);
  if (!a.size && !b.size) return 1;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared);
}

/** A compact sketch of a page: the K smallest hashes of its three-word runs.
 *  Storing the words themselves would bloat the baseline file (one page is
 *  7,000 words), and the previous version of this check read a `sampleWords`
 *  field that nothing ever wrote — so similarity was always 1 and only the
 *  word-count change could ever fire. A sketch is small enough to commit and
 *  still lets two runs be compared on WHAT the page says, not only how long it
 *  is: a vendor swapping a paragraph keeps the count and changes the sketch. */
const SKETCH_K = 128;
function sketch(words) {
  const hashes = new Set();
  for (let i = 0; i + 2 < words.length; i++) {
    hashes.add(createHash('sha1').update(words[i] + ' ' + words[i + 1] + ' ' + words[i + 2]).digest('hex').slice(0, 8));
  }
  return [...hashes].sort().slice(0, SKETCH_K);
}
/** Estimated Jaccard similarity of two sketches (bottom-k of the union). */
function sketchSimilarity(a, b) {
  if (!a?.length || !b?.length) return null;
  const A = new Set(a), B = new Set(b);
  const union = [...new Set([...a, ...b])].sort().slice(0, SKETCH_K);
  let both = 0;
  for (const h of union) if (A.has(h) && B.has(h)) both++;
  return both / union.length;
}
/** Below this many readable words a page is almost certainly a script-rendered
 *  shell, so "unchanged" would mean nothing. Reported, never trusted. */
const THIN_WORDS = 150;

const cards = readdirSync(REG)
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .map((f) => JSON.parse(readFileSync(join(REG, f), 'utf8')));

/* Outside sources that lessons cite in their `sources:` frontmatter (a law, a
   vendor's published terms) are watched exactly like registry cards. Until now
   only tool pages were: a change to the DPDP timetable or to Google's data
   terms would have been noticed by nobody. */
function lessonFiles(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...lessonFiles(p));
    else if (p.endsWith('.mdx')) out.push(p);
  }
  return out;
}
const lessonSources = new Map();   // url -> { label, lessons: [] }
for (const f of lessonFiles(join(ROOT, 'content'))) {
  const lines = readFileSync(f, 'utf8').split(/\r?\n/);
  const close = lines.indexOf('---', 1);
  const at = lines.indexOf('sources:');
  if (at < 0 || at > close) continue;
  let label = '';
  for (let i = at + 1; i < close && /^\s/.test(lines[i]); i++) {
    const l = lines[i].trim().replace(/^- /, '');
    if (l.startsWith('label:')) label = l.slice(6).trim().replace(/^"|"$/g, '');
    else if (l.startsWith('url:')) {
      const url = l.slice(4).trim().replace(/^"|"$/g, '');
      const e = lessonSources.get(url) ?? { label, lessons: [] };
      e.lessons.push(f.slice(ROOT.length).split('\\').join('/'));
      lessonSources.set(url, e);
    }
  }
}
const watched = [
  ...cards,
  ...[...lessonSources.entries()].map(([url, e]) => ({
    id: 'lesson-source-' + createHash('sha1').update(url).digest('hex').slice(0, 8),
    name: 'Lesson source: ' + e.label, docsUrl: url, usedBy: e.lessons,
  })),
];

const prev = existsSync(STORE) ? JSON.parse(readFileSync(STORE, 'utf8')) : { sources: {} };
const next = { generatedAt: new Date().toISOString(), sources: {} };
const changed = [], unreachable = [], fresh = [], thin = [];

/* An honest bot identifier gets 403 from four of fifteen vendors. Two of those
   four (Canva, Midjourney) serve fine to a normal browser UA — the block is a
   crude filter, not a policy about automation, and their robots.txt does not
   disallow these paths. So the watcher presents as a browser.
   The other two (OpenAI help, meta.ai) block regardless, which is what
   `watchUrl` on a card is for. */
const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-GB,en;q=0.9',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Fifteen hosts hit back-to-back from one IP gets throttled: pages that answer
   200 in isolation start returning 403 partway down the list. So requests are
   paced, and a failure is retried once after a longer pause before being
   reported. Without this the weekly report blames the vendor for what is
   really our own request rate — and a report that is wrong a third of the time
   is a report nobody reads. */
async function get(url, attempt = 1) {
  try {
    // Second attempt drops to a bare UA: a few hosts (ai.google.dev among them)
    // reset the connection for a full browser header set but answer a plain one.
    const res = await fetch(url, { headers: attempt === 1 ? HEADERS : { 'user-agent': 'Mozilla/5.0' }, redirect: 'follow', signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } catch (e) {
    if (attempt < 2) { await sleep(5000); return get(url, attempt + 1); }
    throw e;
  }
}

for (const card of watched) {
  await sleep(1500);   // pace the crawl; see get() above
  /* watchUrl exists because a vendor's most useful change signal is not always
     the page a learner should read. OpenAI's help centre blocks scripted
     fetches entirely, but its API changelog does not — and a changelog is a
     better thing to watch anyway. docsUrl stays the link we show learners;
     watchUrl is only what the robot reads. */
  const target = card.watchUrl ?? card.docsUrl;
  let html;
  try {
    html = await get(target);
  } catch (first) {
    // Fall back to the other URL before giving up, so a temporary failure on
    // one does not blind us to the source entirely.
    const other = target === card.docsUrl ? null : card.docsUrl;
    try {
      if (!other) throw first;
      html = await get(other);
    } catch (e) {
      unreachable.push(`${card.id}: ${e.message === undefined || e.name === 'TimeoutError' ? 'timed out' : e.message} (${target})`);
      continue;
    }
  }

  const text = readableText(html);
  const words = text.split(' ').filter(Boolean);
  const fp = {
    hash: createHash('sha256').update(text).digest('hex').slice(0, 16),
    words: words.length,
    sketch: sketch(words),
    finalUrl: target,
  };
  next.sources[card.id] = fp;
  if (words.length < THIN_WORDS) thin.push(`${card.id}: only ${words.length} readable words at ${target}`);

  const before = prev.sources?.[card.id];
  if (!before) { fresh.push(card.id); continue; }
  if (before.hash === fp.hash) continue;

  // A hash difference alone is noisy — a build id or a date changes it. Only
  // report when the readable wording has genuinely diverged.
  const sim = sketchSimilarity(fp.sketch, before.sketch);   // null until a baseline has a sketch
  const delta = before.words ? ((fp.words - before.words) / before.words) * 100 : 0;
  if (Math.abs(delta) >= 2 || (sim !== null && sim < 0.9)) {
    changed.push({
      id: card.id, name: card.name, url: card.docsUrl,
      delta: delta.toFixed(1), was: before.words, now: fp.words,
      sim: sim === null ? null : Math.round(sim * 100),
    });
  }
}

const lines = [];
if (changed.length) {
  lines.push('## Sources that changed', '');
  for (const c of changed) {
    lines.push(`- **${c.name ?? c.id}** (\`${c.id}\`) — readable text ${c.delta > 0 ? '+' : ''}${c.delta}% (${c.was} → ${c.now} words)${c.sim == null ? '' : `, wording ${c.sim}% alike`}`);
    lines.push(`  ${c.url}`);
  }
  lines.push('', 'Re-verify these cards against the page, then set `lastVerified` to today. For a "Lesson source", re-read the lesson that cites it and update its `sources:` date.',
    'See `docs/handbook/verifying-registry-cards.md`.', '');
}
if (unreachable.length) {
  lines.push('## Could not check', '',
    ...unreachable.map((u) => `- ${u}`),
    '', 'Some vendors block scripted fetches outright. Open these in a real browser to check them, and if the block is permanent give the card a `watchUrl` pointing at a reachable changelog or newsroom.', '');
}
if (thin.length) {
  lines.push('## Weak signal — cannot be trusted as "unchanged"', '',
    ...thin.map((t) => `- ${t}`),
    '', 'The page is almost entirely script-rendered, so a quiet result proves nothing. Give the card a `watchUrl` pointing at a changelog or newsroom that serves real text, or check it by hand each month.', '');
}
if (fresh.length) lines.push(`## Newly tracked\n\n${fresh.map((f) => `- ${f}`).join('\n')}\n`);

const report = lines.join('\n') || 'No source changes detected.';
console.log(report);
writeFileSync(join(ROOT, 'source-report.md'), report);

if (UPDATE) {
  // Carry forward word lists we did not refresh, so an unreachable source does
  // not lose its history.
  for (const [id, fp] of Object.entries(prev.sources ?? {})) {
    if (!next.sources[id]) next.sources[id] = fp;
  }
  writeFileSync(STORE, JSON.stringify(next, null, 2) + '\n');
  console.log(`\nFingerprints written for ${Object.keys(next.sources).length} source(s).`);
}

process.exit(changed.length ? 1 : 0);
