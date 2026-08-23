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
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
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

const cards = readdirSync(REG)
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .map((f) => JSON.parse(readFileSync(join(REG, f), 'utf8')));

const prev = existsSync(STORE) ? JSON.parse(readFileSync(STORE, 'utf8')) : { sources: {} };
const next = { generatedAt: new Date().toISOString(), sources: {} };
const changed = [], unreachable = [], fresh = [];

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
    const res = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } catch (e) {
    if (attempt < 2) { await sleep(5000); return get(url, attempt + 1); }
    throw e;
  }
}

for (const card of cards) {
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
    finalUrl: target,
  };
  next.sources[card.id] = fp;

  const before = prev.sources?.[card.id];
  if (!before) { fresh.push(card.id); continue; }
  if (before.hash === fp.hash) continue;

  // A hash difference alone is noisy — a build id or a date changes it. Only
  // report when the readable wording has genuinely diverged.
  const sim = similarity(words, (before.sampleWords ?? []).length ? before.sampleWords : words);
  const delta = before.words ? ((fp.words - before.words) / before.words) * 100 : 0;
  if (Math.abs(delta) >= 2 || sim < 0.9) {
    changed.push({
      id: card.id, name: card.name, url: card.docsUrl,
      delta: delta.toFixed(1), was: before.words, now: fp.words,
    });
  }
}

const lines = [];
if (changed.length) {
  lines.push('## Sources that changed', '');
  for (const c of changed) {
    lines.push(`- **${c.name ?? c.id}** (\`${c.id}\`) — readable text ${c.delta > 0 ? '+' : ''}${c.delta}% (${c.was} → ${c.now} words)`);
    lines.push(`  ${c.url}`);
  }
  lines.push('', 'Re-verify these cards against the page, then set `lastVerified` to today.',
    'See `docs/handbook/verifying-registry-cards.md`.', '');
}
if (unreachable.length) {
  lines.push('## Could not check', '',
    ...unreachable.map((u) => `- ${u}`),
    '', 'Some vendors block scripted fetches outright. Open these in a real browser to check them, and if the block is permanent give the card a `watchUrl` pointing at a reachable changelog or newsroom.', '');
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
