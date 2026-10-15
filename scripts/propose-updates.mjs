#!/usr/bin/env node
/**
 * Turns the weekly freshness findings into a review packet — and, when a model
 * key is available, into DRAFT edits that a person can accept or reject.
 *
 * What this will never do is change a lesson. The weekly job opens or updates
 * one GitHub issue; the packet below goes in it. A person reads the evidence,
 * edits the lesson, bumps `lastVerified`, and commits. That is deliberate, and
 * it is the same line the rest of Lrnon draws: a changed source means "a human
 * should look", and a model's unchecked suggestion is exactly the kind of thing
 * P-track lessons teach people not to publish.
 *
 * With GEMINI_API_KEY set, each flagged claim is put to a model together with
 * the text of the vendor page (or cited source), and the model must answer with
 * a verbatim quotation FROM THAT PAGE. A suggestion whose quotation does not
 * appear in the page text is discarded by code, not by trust — the same
 * citation-must-exist rule Sky applies to its own answers. A suggestion that
 * survives is still labelled UNREVIEWED.
 *
 *   node scripts/propose-updates.mjs            # reads content-audit.json + source-report.md
 *   GEMINI_API_KEY=… node scripts/propose-updates.mjs
 *
 * Writes freshness-packet.md.
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const MODEL = process.env.PROPOSE_MODEL ?? 'gemini-flash-lite-latest';
const MAX_LESSONS = Number(process.env.PROPOSE_MAX_LESSONS ?? 8);
const PAGE_CHARS = 9000;
const CLAIM_KINDS = new Set(['model-version', 'price', 'quota', 'context-size', 'year', 'statistic', 'law-or-regulation', 'feature-claim', 'free-claim']);

/** Collapse whitespace and quote-style so a harmless difference in spacing or
 *  typographic quotes does not reject a genuine quotation. */
export function normalise(t) {
  return String(t).toLowerCase().replace(/[‘’“”]/g, "'").replace(/\s+/g, ' ').trim();
}

/** The guard: a suggestion survives only if its evidence is really on the page. */
export function evidenceIsOnPage(quote, pageText) {
  const q = normalise(quote);
  if (q.length < 25) return false;            // too short to prove anything
  return normalise(pageText).includes(q);
}

export function readableText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchPage(url) {
  for (const ua of ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36', 'Mozilla/5.0']) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': ua }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
      if (r.ok) return readableText(await r.text()).slice(0, PAGE_CHARS);
    } catch { /* try the next */ }
  }
  return '';
}

async function askModel(key, lesson, claims, pageText, url) {
  const prompt = `You are checking an educational lesson for out-of-date claims, using ONLY the page text supplied.
Lesson: ${lesson.title}
Claims from the lesson (each with its surrounding sentence):
${claims.map((c, i) => `${i + 1}. "${c.context}"`).join('\n')}

Page text (from ${url}):
"""
${pageText}
"""

For each claim answer one of: "supported", "contradicted", "not-covered".
For "supported" or "contradicted" you MUST copy a quotation of at least 25 characters EXACTLY as it appears in the page text. If the page does not address the claim, answer "not-covered" with an empty quote. Do not use any knowledge from outside the page. If "contradicted", propose a minimal rewrite of the sentence that is true according to the quotation, and keep the lesson's tone.
Reply with JSON only: [{"n":1,"verdict":"supported|contradicted|not-covered","quote":"","rewrite":""}]`;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 1500 },
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error('model HTTP ' + r.status);
  const j = await r.json();
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '[]';
  return JSON.parse(text);
}

// ---------------------------------------------------------------- main
async function main() {
  const audit = JSON.parse(fs.readFileSync('content-audit.json', 'utf8'));
  const report = fs.existsSync('source-report.md') ? fs.readFileSync('source-report.md', 'utf8') : '';
  const registry = Object.fromEntries(fs.readdirSync('registry').filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .map((f) => { const c = JSON.parse(fs.readFileSync('registry/' + f, 'utf8')); return [c.id, c]; }));

  // Cards whose vendor page changed this week.
  const changedCards = new Set([...report.matchAll(/\(`([a-z0-9-]+)`\) — readable text/g)].map((m) => m[1]));
  const changedLessonSources = /Lesson source/.test(report.split('## Could not check')[0] ?? '');

  const flagged = audit.lessons.filter((l) =>
    l.status !== 'ok' || l.toolsDeclared.some((t) => changedCards.has(t)) || (changedLessonSources && l.sources.length));

  /* Most urgent first: a source that moved, then lessons that make time-sensitive
     claims, then simply the oldest. When a whole quarter goes due at once the
     packet shows the few that matter before the many that do not. */
  const score = (l) =>
    (l.toolsDeclared.some((t) => changedCards.has(t)) ? 10000 : 0) +
    (l.volatile.filter((v) => CLAIM_KINDS.has(v.kind)).length * 10) + l.ageDays;
  flagged.sort((a, b) => score(b) - score(a));

  const out = [`# Freshness packet — ${audit.summary.asOf}`, '',
    'Everything below is **unreviewed**. Nothing has been edited. A person reads the evidence, changes the lesson if it is wrong, and updates `lastVerified`.', ''];

  const key = process.env.GEMINI_API_KEY;
  out.push(key ? `Draft checks by \`${MODEL}\`: a suggestion appears only if its quotation was found verbatim in the fetched page.` : 'No model key configured: this is the evidence list only, with no draft edits.', '');

  const take = flagged.slice(0, MAX_LESSONS);
  if (!take.length) out.push('No lessons are flagged this week.');
  for (const l of take) {
    out.push(`## ${l.file} — ${l.title}`, `Last re-read ${l.lastVerified} (${l.ageDays} days). Why flagged: ${[
      l.status !== 'ok' ? `age ${l.status}` : '',
      l.toolsDeclared.filter((t) => changedCards.has(t)).map((t) => `${t} page changed`).join(', '),
      changedLessonSources && l.sources.length ? 'a cited source changed' : '',
    ].filter(Boolean).join('; ')}`, '');

    const claims = l.volatile.filter((v) => CLAIM_KINDS.has(v.kind)).slice(0, 12);
    const pages = [
      ...l.toolsDeclared.filter((t) => registry[t]).map((t) => ({ url: registry[t].watchUrl ?? registry[t].docsUrl, label: registry[t].name })),
      ...l.sources.filter((s) => s.url).map((s) => ({ url: s.url, label: s.label })),
    ];
    out.push('Check against:', ...pages.map((p) => `- ${p.label}: ${p.url}`), '');
    out.push(claims.length ? 'Time-sensitive sentences:' : 'No specific time-sensitive sentences were detected; re-read it for general currency.',
      ...claims.map((c) => `- L${c.line} (${c.kind}): …${c.context}…`), '');

    if (key && claims.length && pages.length) {
      let pageText = '', used = '';
      for (const p of pages) { pageText = await fetchPage(p.url); if (pageText) { used = p.url; break; } }
      if (!pageText) { out.push('_Draft check skipped: no source page could be fetched._', ''); continue; }
      try {
        const answers = await askModel(key, l, claims, pageText, used);
        const kept = answers.filter((a) => a.verdict !== 'not-covered' && evidenceIsOnPage(a.quote, pageText));
        const dropped = answers.length - kept.length;
        for (const a of kept) {
          const c = claims[a.n - 1]; if (!c) continue;
          out.push(`- **${a.verdict.toUpperCase()}** (L${c.line}) — evidence from ${used}: “${a.quote}”`);
          if (a.verdict === 'contradicted' && a.rewrite) out.push(`  - suggested rewrite (UNREVIEWED): ${a.rewrite}`);
        }
        out.push(`_${dropped} answer(s) discarded: not covered by the page, or the quotation was not found in it._`, '');
      } catch (e) { out.push(`_Draft check failed: ${e.message}_`, ''); }
      await new Promise((r) => setTimeout(r, 8000));     // stay inside a free-tier rate limit
    }
  }
  if (flagged.length > take.length) out.push(`…and ${flagged.length - take.length} more flagged lessons; see content-audit.md.`);
  fs.writeFileSync('freshness-packet.md', out.join('\n') + '\n');
  console.log(`packet: ${take.length} of ${flagged.length} flagged lessons${key ? ' (model drafts on)' : ' (evidence only)'}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
