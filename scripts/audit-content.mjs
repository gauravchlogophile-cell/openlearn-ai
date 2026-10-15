#!/usr/bin/env node
/**
 * Lesson-level freshness audit.
 *
 * The registry-card linter (validate-content.mjs, CUR-7) and the vendor-page
 * watcher (check-sources.mjs) cover the TOOL descriptions. Neither looks at the
 * 204 lessons themselves, and a lesson can go stale without any card changing:
 * it names a model version, a price, a limit, a year, a statistic or a product
 * the registry has never heard of.
 *
 * This script reads every lesson and reports, per lesson:
 *   - age          days since lastVerified (WARN > 90, FAIL > 180: lessons teach
 *                  judgement, so they are allowed to age slower than a card)
 *   - unsourced    products named in the body that are not in `tools:` and so
 *                  render no source or date (the gap the user asked about)
 *   - unregistered products named in the body that have no registry card at all
 *   - volatile     phrases that rot: model versions, prices, quotas, years,
 *                  "currently / latest / new", "as of", statistics
 *   - links        external URLs (checked for liveness with --links)
 *
 * It NEVER edits a lesson. A changed or doubtful claim is a prompt for a person
 * to look, which is the same stance as check-sources.mjs and the curriculum's
 * own teaching: automation proposes, a human decides.
 *
 *   node scripts/audit-content.mjs              # report only, exit 0
 *   node scripts/audit-content.mjs --links      # also check external URLs
 *   node scripts/audit-content.mjs --strict     # exit 1 on any FAIL
 *   OL_TODAY=2026-12-01 node scripts/audit-content.mjs   # preview a future date
 *
 * Writes content-audit.md (human) and content-audit.json (machine; read by the
 * admin freshness panel and by the weekly workflow).
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TODAY = new Date((process.env.OL_TODAY ?? new Date().toISOString().slice(0, 10)) + 'T00:00:00Z');
const WARN_DAYS = 90;
const FAIL_DAYS = 180;
const args = new Set(process.argv.slice(2));

// ---------------------------------------------------------------- registry
const registry = fs.readdirSync('registry')
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .map((f) => JSON.parse(fs.readFileSync(path.join('registry', f), 'utf8')));

/* Names a learner would recognise → registry id. Matching is on whole words,
   case-sensitive for the short ones that collide with ordinary English. */
const KNOWN = {
  chatgpt: ['ChatGPT'], claude: ['Claude'], gemini: ['Gemini'], copilot: ['Microsoft Copilot', 'Copilot'],
  'github-copilot': ['GitHub Copilot'], perplexity: ['Perplexity'], grok: ['Grok'],
  'meta-ai': ['Meta AI'], deepseek: ['DeepSeek'], llama: ['Llama'], mistral: ['Mistral'], qwen: ['Qwen'],
  midjourney: ['Midjourney'], 'stable-diffusion': ['Stable Diffusion'], elevenlabs: ['ElevenLabs'],
  'canva-ai': ['Canva'], 'notion-ai': ['Notion AI', 'Notion'], notebooklm: ['NotebookLM', 'Gemini Notebook'],
  n8n: ['n8n'],
};
/* Products the curriculum may name that the registry does NOT cover. Finding
   one in a lesson means a claim about a third party with no source and no date
   anywhere on the page. */
const UNREGISTERED = [
  'Cursor', 'Windsurf', 'Zapier', 'Make.com', 'Sora', 'Veo',
  'Suno', 'Udio', 'Runway', 'DALL-E', 'DALL·E', 'Firefly', 'Whisper', 'Hugging Face', 'Ollama',
  'LM Studio', 'LangChain', 'Replit', 'Lovable', 'Bolt', 'Codex', 'Devin', 'Copilot Studio', 'Bard', 'Siri',
  'Alexa', 'Duolingo', 'Khanmigo', 'Otter', 'Grammarly', 'Character.AI', 'Replika', 'Pi', 'Poe', 'Kimi',
  'MCP', 'Model Context Protocol', 'Apple Intelligence', 'Gemma', 'Phi', 'Cohere', 'Flux', 'Ideogram', 'Leonardo',
];
const SHORT_CASE_SENSITIVE = new Set(['Pi', 'Bolt', 'Make.com', 'Phi', 'Flux', 'Poe', 'Otter', 'Cursor', 'Make']);

// ---------------------------------------------------------------- volatile patterns
const VOLATILE = [
  ['model-version', /\b(?:GPT[- ]?\d[\w.]*|Claude (?:\d[\w.]*|Opus|Sonnet|Haiku)[\w. ]{0,12}|Gemini \d[\w.]*|Llama ?\d[\w.]*|o[134]-?\w*|Mistral (?:Large|Medium|Small|\d)\w*|Qwen ?\d[\w.]*|DeepSeek[- ]?[VR]\d[\w.]*|Grok[- ]?\d[\w.]*)\b/g],
  ['price', /(?:[$£€₹]\s?\d[\d,.]*(?:\s?(?:\/|per)\s?(?:month|mo|year|yr|user|token|million|M))?|\b\d[\d,.]*\s?(?:USD|GBP|EUR|INR|rupees|dollars|pounds)\b)/gi],
  ['quota', /\b\d[\d,]*\s?(?:messages?|prompts?|requests?|images?|queries|uses|credits|tokens|calls)\s?(?:\/|per|a|each)\s?(?:day|hour|week|month|3 hours)\b/gi],
  ['context-size', /\b\d[\d,.]*\s?(?:[KkMm]|thousand|million)\s?(?:-?token)?s?\s?(?:context|window)\b/g],
  ['year', /\b(?:in|since|by|during|from|as of|until|before|after)\s(?:early |mid-?|late )?(20(?:2[3-9]|3\d))\b/gi],
  ['recency-word', /\b(?:currently|at the moment|right now|these days|latest|newest|most recent|recently|just (?:launched|released|announced)|as of (?:this|today|now|writing)|this year|last year|new(?:ly)? (?:launched|released|added|introduced))\b/gi],
  ['statistic', /\b\d{1,3}(?:\.\d+)?\s?(?:%|per ?cent)\b|\b(?:\d[\d,.]*\s?(?:million|billion|m|bn))\s+(?:users|people|weekly|monthly|downloads|customers)\b/gi],
  ['law-or-regulation', /\b(?:EU AI Act|AI Act|GDPR|DPDP(?:A)?|CCPA|HIPAA|Digital Services Act|executive order|Article \d+)\b/g],
  ['free-claim', /\bfree (?:tier|plan|version|trial|to use)\b/gi],
  ['feature-claim', /\b(?:can now|now (?:supports?|offers?|lets?|includes?)|launched|rolled out|introduced|announced)\b/gi],
];

// ---------------------------------------------------------------- read lessons
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (e.name.endsWith('.mdx')) out.push(p);
  }
  return out;
}

function frontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return { fm: {}, body: src };
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim().replace(/^"|"$/g, '');
  }
  const t = m[1].match(/^tools:\s*\[(.*)\]/m);
  fm.toolsList = t ? [...t[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
  return { fm, body: m[2] };
}

/* Strip what is not prose: imports, JSX props that hold quiz data, fenced code.
   Quiz stems ARE teaching content, so they stay; only the scaffolding goes. */
function prose(body) {
  return body
    .replace(/^import .*$/gm, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<RegistryCard[^>]*\/>/g, ' ');
}

/* Entries of the lesson's own `sources:` frontmatter (label + url + date). */
function declaredSources(src) {
  const lines = src.split(/\r?\n/);
  const close = lines.indexOf('---', 1);
  const at = lines.indexOf('sources:');
  const out = [];
  if (at < 0 || at > close) return out;
  let cur = null;
  for (let i = at + 1; i < close && /^\s/.test(lines[i]); i++) {
    const l = lines[i].trim().replace(/^- /, '');
    const k = l.slice(0, l.indexOf(':'));
    const v = l.slice(l.indexOf(':') + 1).trim().replace(/^"|"$/g, '');
    if (k === 'label') { cur = { label: v }; out.push(cur); }
    else if (cur && ['url', 'retrieved', 'kind'].includes(k)) cur[k] = v;
  }
  return out;
}

const wordRe = (w, cs) => new RegExp(`(?<![\\w-])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, cs ? 'g' : 'gi');
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

const lessons = [];
for (const file of [...walk('content/explorer'), ...walk('content/practitioner')].sort()) {
  const src = fs.readFileSync(file, 'utf8');
  const { fm, body } = frontmatter(src);
  const text = prose(body);
  /* "Gemini Notebook" is NotebookLM's new name, not a mention of Gemini. */
  const textForGemini = text.replace(/Gemini Notebook/g, ' ');
  const days = Math.floor((TODAY - new Date(fm.lastVerified + 'T00:00:00Z')) / 864e5);
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');

  // Products named in the body.
  const named = new Map();
  for (const [id, names] of Object.entries(KNOWN)) {
    for (const n of names) {
      const hits = [...(id === 'gemini' ? textForGemini : text).matchAll(wordRe(n, true))];
      if (hits.length) named.set(id, (named.get(id) ?? 0) + hits.length);
    }
  }
  // Longest-name-first double counting guard: "GitHub Copilot" also matches "Copilot".
  if (named.has('github-copilot') && named.has('copilot')) {
    const gh = [...text.matchAll(/GitHub Copilot/g)].length;
    const all = [...text.matchAll(/(?<![\w-])Copilot(?![\w-])/g)].length;
    const ms = [...text.matchAll(/Microsoft Copilot/g)].length;
    if (all - gh - ms <= 0 && ms === 0) named.delete('copilot');
  }
  if (named.has('notion-ai') === false && named.has('notebooklm') === false) { /* nothing */ }

  const sourced = new Set(fm.toolsList);
  const unsourced = [...named.entries()]
    .filter(([id, n]) => !sourced.has(id) && n >= 1)
    .map(([id, n]) => ({ id, mentions: n }));

  const unregistered = [];
  for (const n of UNREGISTERED) {
    const hits = [...text.matchAll(wordRe(n, SHORT_CASE_SENSITIVE.has(n)))];
    if (hits.length) unregistered.push({ name: n, mentions: hits.length });
  }

  const volatile = [];
  for (const [kind, re] of VOLATILE) {
    for (const m of text.matchAll(re)) {
      const start = Math.max(0, m.index - 50);
      volatile.push({
        kind, match: m[0].trim(), line: lineOf(text, m.index),
        context: text.slice(start, m.index + m[0].length + 50).replace(/\s+/g, ' ').trim(),
      });
    }
  }

  const lawsNamed = [...new Set(volatile.filter((v) => v.kind === 'law-or-regulation').map((v) => v.match))];
  /* Reserved example hosts (RFC 2606) appear on purpose — P3·L4 shows an
     exfiltration URL — and must not be reported as dead links. */
  const RESERVED = /^https?:\/\/(?:[^/]*\.)?(?:example|test|invalid|localhost)(?:\.[a-z]+)?(?:[:/]|$)/i;
  const urls = [...new Set([...src.matchAll(/https?:\/\/[^\s)"'<>\]]+/g)].map((m) => m[0].replace(/[.,;]+$/, '')))]
    .filter((u) => !RESERVED.test(u));

  lessons.push({
    file: rel, module: fm.module, order: Number(fm.order), title: fm.title, lastVerified: fm.lastVerified, ageDays: days,
    toolsDeclared: fm.toolsList, sources: declaredSources(src), lawsNamed, unsourced, unregistered, volatile, urls,
    status: days > FAIL_DAYS ? 'FAIL' : days > WARN_DAYS ? 'WARN' : 'ok',
  });
}

// ---------------------------------------------------------------- link liveness
const linkProblems = [];
if (args.has('--links')) {
  const all = [...new Set(lessons.flatMap((l) => l.urls))];
  for (const url of all) {
    let code = 0;
    try {
      const r = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(20000),
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; LrnonAudit/1.0; +https://lrnon.org)' } });
      code = r.status;
    } catch { code = 0; }
    // 403/429 are bot protection, not rot (handbook says the same of Meta AI).
    if (code === 404 || code === 410 || code === 0 || code >= 500) linkProblems.push({ url, code, files: lessons.filter((l) => l.urls.includes(url)).map((l) => l.file) });
    await new Promise((r) => setTimeout(r, 400));
  }
}

// ---------------------------------------------------------------- registry-wide
const registryRows = registry.map((c) => ({
  id: c.id, name: c.name, lastVerified: c.lastVerified,
  ageDays: Math.floor((TODAY - new Date(c.lastVerified + 'T00:00:00Z')) / 864e5),
  usedBy: lessons.filter((l) => l.toolsDeclared.includes(c.id)).length,
  mentionedIn: lessons.filter((l) => l.unsourced.some((u) => u.id === c.id)).length,
}));

const summary = {
  generatedAt: new Date().toISOString(), asOf: TODAY.toISOString().slice(0, 10),
  thresholds: { warnDays: WARN_DAYS, failDays: FAIL_DAYS },
  lessons: lessons.length,
  byStatus: { ok: lessons.filter((l) => l.status === 'ok').length, WARN: lessons.filter((l) => l.status === 'WARN').length, FAIL: lessons.filter((l) => l.status === 'FAIL').length },
  lessonsNamingUnsourcedTools: lessons.filter((l) => l.unsourced.length).length,
  lessonsWithLawAndNoSource: lessons.filter((l) => l.lawsNamed.length && !l.sources.length).length,
  lessonsNamingUnregistered: lessons.filter((l) => l.unregistered.length).length,
  volatileTotal: lessons.reduce((n, l) => n + l.volatile.length, 0),
  brokenLinks: linkProblems.length,
};
fs.writeFileSync('content-audit.json', JSON.stringify({ summary, registry: registryRows, linkProblems, lessons }, null, 2) + '\n');

// ---------------------------------------------------------------- markdown report
const md = [];
md.push(`# Content freshness audit — ${summary.asOf}`, '');
md.push(`Lessons: **${summary.lessons}** · ok ${summary.byStatus.ok} · due (>${WARN_DAYS}d) ${summary.byStatus.WARN} · overdue (>${FAIL_DAYS}d) ${summary.byStatus.FAIL}`);
md.push(`Lessons naming a law or regulation with no cited source: **${summary.lessonsWithLawAndNoSource}** · lessons naming a product with no source/date on the page: **${summary.lessonsNamingUnsourcedTools}** · naming a product with no registry card at all: **${summary.lessonsNamingUnregistered}** · volatile phrases to re-check: **${summary.volatileTotal}**`, '');

md.push('## By module', '', '| Module | Lessons | Oldest check | Unsourced tool mentions | Volatile phrases |', '|---|---|---|---|---|');
const mods = [...new Set(lessons.map((l) => l.module))];
for (const m of mods) {
  const ls = lessons.filter((l) => l.module === m);
  md.push(`| ${m} | ${ls.length} | ${Math.max(...ls.map((l) => l.ageDays))}d | ${ls.filter((l) => l.unsourced.length).length} | ${ls.reduce((n, l) => n + l.volatile.length, 0)} |`);
}

md.push('', '## Registry cards', '', '| Card | Verified | Age | Lessons citing it | Lessons naming it without citing |', '|---|---|---|---|---|');
for (const r of registryRows.sort((a, b) => b.ageDays - a.ageDays)) md.push(`| ${r.id} | ${r.lastVerified} | ${r.ageDays}d | ${r.usedBy} | ${r.mentionedIn} |`);

md.push('', '## Missing sources — products named, nothing cited', '');
md.push('Declare these in the lesson\'s `tools:` frontmatter (so the page renders source + date) or remove the mention.', '');
for (const l of lessons.filter((x) => x.unsourced.length)) md.push(`- \`${l.file}\` — ${l.unsourced.map((u) => `${u.id} ×${u.mentions}`).join(', ')}`);

md.push('', '## Missing sources — laws and regulations named, nothing cited', '');
md.push('Add a `sources:` entry (label, https url, date you read it) to each, preferring the official text. A source you did not actually read should not be listed.', '');
for (const l of lessons.filter((x) => x.lawsNamed.length && !x.sources.length)) md.push(`- \`${l.file}\` — ${l.lawsNamed.join(', ')}`);

md.push('', '## Missing sources — products with no registry card', '');
md.push('No card exists, so no page can show a source. Add a card or stop naming the product.', '');
const unregAgg = new Map();
for (const l of lessons) for (const u of l.unregistered) { const a = unregAgg.get(u.name) ?? []; a.push(`${l.file} ×${u.mentions}`); unregAgg.set(u.name, a); }
for (const [name, files] of [...unregAgg.entries()].sort((a, b) => b[1].length - a[1].length)) md.push(`- **${name}** (${files.length} lessons): ${files.slice(0, 6).join('; ')}${files.length > 6 ? '; …' : ''}`);

md.push('', '## Volatile claims to re-check (grouped by lesson)', '');
for (const l of lessons.filter((x) => x.volatile.length)) {
  md.push(`### ${l.file} — ${l.title} (verified ${l.lastVerified}, ${l.ageDays}d)`);
  const seen = new Set();
  for (const v of l.volatile) { const k = v.kind + v.match; if (seen.has(k)) continue; seen.add(k); md.push(`- L${v.line} \`${v.kind}\` “${v.match}” — …${v.context}…`); }
  md.push('');
}
if (args.has('--links')) {
  md.push('## Broken external links', '');
  md.push(linkProblems.length ? linkProblems.map((p) => `- ${p.url} → ${p.code || 'no response'} (${p.files.join(', ')})`).join('\n') : 'None.');
}
fs.writeFileSync('content-audit.md', md.join('\n') + '\n');

console.log(`audit ${summary.asOf}: ${summary.lessons} lessons | ok ${summary.byStatus.ok}, due ${summary.byStatus.WARN}, overdue ${summary.byStatus.FAIL}`);
console.log(`  unsourced-tool lessons ${summary.lessonsNamingUnsourcedTools} | unregistered-product lessons ${summary.lessonsNamingUnregistered} | volatile phrases ${summary.volatileTotal} | broken links ${summary.brokenLinks}`);
console.log('  wrote content-audit.md, content-audit.json');
if (args.has('--strict') && (summary.byStatus.FAIL || linkProblems.length)) process.exit(1);
