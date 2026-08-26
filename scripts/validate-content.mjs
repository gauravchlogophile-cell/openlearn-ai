#!/usr/bin/env node
/**
 * Content & registry linter — Sprint 1 (FR-CONT-1, CUR-2/3/7 subset).
 * Dependency-free by design: runs before npm install in CI cold starts.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokens as skyTokens } from '../src/lib/sky-guard.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const errors = [];
const warnings = [];

// ---------- helpers ----------
function walk(dir, ext) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, ext));
    else if (p.endsWith(ext)) out.push(p);
  }
  return out;
}

/** Minimal YAML frontmatter parser for our known schema (scalars, string
 *  arrays, and the flashcards list of {front, back}). Deliberately strict. */
function parseFrontmatter(src, file) {
  const m = src.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = {};
  const lines = m[1].split('\n');
  let key = null, list = null, obj = null;
  for (const raw of lines) {
    const line = raw.replace(/\t/g, '  ');
    if (/^[a-zA-Z]/.test(line)) {
      const idx = line.indexOf(':');
      key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (val === '') { list = []; fm[key] = list; obj = null; }
      else { fm[key] = val.replace(/^"|"$/g, ''); list = null; obj = null; }
    } else if (/^\s+- front:/.test(line)) {
      obj = { front: line.replace(/^\s+- front:\s*/, '').replace(/^"|"$/g, '') };
      list?.push(obj);
    } else if (/^\s+back:/.test(line) && obj) {
      obj.back = line.replace(/^\s+back:\s*/, '').replace(/^"|"$/g, '');
    } else if (/^\s+-\s/.test(line) && list) {
      list.push(line.replace(/^\s+-\s*/, '').replace(/^"|"$/g, ''));
    } else if (line.trim() !== '') {
      warnings.push(`${file}: unparsed frontmatter line: "${line.trim()}"`);
    }
  }
  return fm;
}

// ---------- lesson checks ----------
const REQUIRED = ['title','description','track','module','order','minutes',
  'objectives','concepts','flashcards','lastVerified','contributors','licence'];
const TRACKS = ['explorer','practitioner','builder'];

const registryIds = new Set(
  walk(join(ROOT, 'registry'), '.json')
    // Underscore-prefixed files are machinery (_schema, _fingerprints), not cards.
    .filter(p => !/[\/\\]_/.test(p))
    .map(p => JSON.parse(readFileSync(p, 'utf8')).id)
);

const lessonFiles = walk(join(ROOT, 'content'), '.mdx');
if (lessonFiles.length === 0) errors.push('No lessons found under /content');

for (const file of lessonFiles) {
  const rel = relative(ROOT, file);
  const src = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const fm = parseFrontmatter(src, rel);
  if (!fm) { errors.push(`${rel}: missing frontmatter`); continue; }

  for (const k of REQUIRED) if (!(k in fm)) errors.push(`${rel}: missing "${k}"`);
  if (fm.title && fm.title.length > 60) errors.push(`${rel}: title >60 chars (${fm.title.length})`);
  if (fm.description && (fm.description.length < 80 || fm.description.length > 160))
    errors.push(`${rel}: description must be 80–160 chars (${fm.description.length})`);
  if (fm.track && !TRACKS.includes(fm.track)) errors.push(`${rel}: unknown track "${fm.track}"`);
  if (fm.minutes && (Number(fm.minutes) < 3 || Number(fm.minutes) > 15))
    errors.push(`${rel}: minutes must be 3–15 (CUR-2)`);
  if (Array.isArray(fm.objectives) && (fm.objectives.length < 1 || fm.objectives.length > 3))
    errors.push(`${rel}: objectives must be 1–3`);
  if (Array.isArray(fm.flashcards)) {
    if (fm.flashcards.length < 2 || fm.flashcards.length > 6)
      errors.push(`${rel}: flashcards must be 2–6`);
    for (const c of fm.flashcards)
      if (!c.front || !c.back) errors.push(`${rel}: flashcard missing front/back`);
  }
  if (fm.lastVerified && !/^\d{4}-\d{2}-\d{2}$/.test(fm.lastVerified))
    errors.push(`${rel}: lastVerified must be YYYY-MM-DD`);
  if (fm.licence !== 'CC-BY-SA-4.0') errors.push(`${rel}: licence must be CC-BY-SA-4.0`);
  if (Array.isArray(fm.tools))
    for (const t of fm.tools)
      if (!registryIds.has(t)) errors.push(`${rel}: tool "${t}" not in /registry (CUR-3)`);

  // Body checks: recap required; no raw <script>; hype-word lint
  const body = src.replace(/^---\n[\s\S]*?\n---/, '');
  if (!/##\s*Recap/i.test(body)) errors.push(`${rel}: missing "## Recap" section`);
  if (/<script/i.test(body)) errors.push(`${rel}: raw <script> is forbidden (FR-CONT-2)`);

  /* Every lesson must carry an inline quiz.
     This is not a style rule — lesson completion depends on it. A learner
     only earns the tick and the XP for a lesson after answering its questions
     at least once, so a lesson shipped without a quiz silently changes how
     completion works for that lesson: CompleteButton falls back to unlocked,
     the tick becomes a click rather than something earned, and the module's
     progress bar starts counting a lesson nobody was checked on. The fallback
     exists so a missing quiz cannot strand a learner; this rule exists so a
     missing quiz cannot happen by accident in the first place. */
  const quizTag = body.match(/<Quiz\b[\s\S]*?\/>/);
  if (!quizTag) {
    errors.push(`${rel}: no <Quiz> — every lesson needs one, because the completion tick depends on answering it`);
  } else {
    if (!/import\s+Quiz\s+from/.test(body))
      errors.push(`${rel}: uses <Quiz> without importing it`);
    if (!/client:visible/.test(quizTag[0]))
      errors.push(`${rel}: <Quiz> must be client:visible or it never hydrates`);

    /* Shape-check the questions. The module-quiz banks in content/quizzes are
       already validated below; inline quizzes had no equivalent, so a typo in
       an answer index would have shipped as a question that marks the correct
       response wrong. */
    const qs = [...quizTag[0].matchAll(/\bq:\s*["']/g)].length;
    const opts = [...quizTag[0].matchAll(/\boptions:\s*\[/g)].length;
    const answers = [...quizTag[0].matchAll(/\banswer:\s*(\d+)/g)];
    const explains = [...quizTag[0].matchAll(/\bexplain:\s*["']/g)].length;
    if (qs < 1) errors.push(`${rel}: <Quiz> has no questions`);
    if (qs !== opts || qs !== answers.length || qs !== explains)
      errors.push(`${rel}: <Quiz> malformed — ${qs} q, ${opts} options, ${answers.length} answer, ${explains} explain (each question needs all four)`);
    // Options are shuffled at display time, so the stored index only has to be
    // in range for the smallest option list we can see.
    for (const a of answers)
      if (Number(a[1]) > 3)
        errors.push(`${rel}: <Quiz> answer index ${a[1]} looks out of range`);

    /* A stem too short to defend.
       sky-guard matches a question against Sky's index by its distinctive
       words: it drops stop-words and anything under three characters, then
       needs at least two words left to call something a quiz stem. A question
       like "A token is:" reduces to one word, so the guard cannot recognise
       it — and Sky would answer it for a learner sitting the quiz.
       That exact stem shipped and was caught by the guard's own test in CI,
       which is one layer too late: the author should hear it here, where the
       fix is obvious. A stem this generic is a weak question anyway. */
    /* The quote handling matters: a naive ["']([^"']+)["'] stops at the
       apostrophe inside "Why doesn't a model know", captures "Why doesn", and
       reports 23 confident false positives. Match to the matching closing
       quote instead, allowing escapes. */
    const stemRe = /\bq:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
    for (const m of quizTag[0].matchAll(stemRe)) {
      const stem = m[1] ?? m[2];
      // sky-guard exports the tokeniser it actually uses. Importing it beats
      // copying its stop list, which would drift and silently stop this check
      // matching the thing it protects. Still dependency-free: a local module,
      // not a package, so a cold CI start needs no install.
      const distinctive = skyTokens(stem);
      if (new Set(distinctive).size < 2)
        errors.push(`${rel}: quiz stem "${stem}" has fewer than two distinctive words — Sky's assessment guard cannot protect it, so make it more specific`);
    }
  }
  for (const w of ['revolutionary','game-changing','mind-blowing','superpower'])
    if (new RegExp(`\\b${w}`, 'i').test(body))
      warnings.push(`${rel}: hype word "${w}" — style guide asks for plain claims`);
}

// ---------- registry checks ----------
const today = process.env.OL_TODAY ? new Date(process.env.OL_TODAY) : new Date();
for (const p of walk(join(ROOT, 'registry'), '.json')) {
  if (/[\/\\]_/.test(p)) continue;   // machinery, not a card
  const rel = relative(ROOT, p);
  let card;
  try { card = JSON.parse(readFileSync(p, 'utf8')); }
  catch { errors.push(`${rel}: invalid JSON`); continue; }
  for (const k of ['id','name','vendor','category','summary','docsUrl','lastVerified','verifier','tier'])
    if (!(k in card)) errors.push(`${rel}: missing "${k}"`);
  if (card.summary && (card.summary.length < 40 || card.summary.length > 240))
    errors.push(`${rel}: summary must be 40–240 chars`);
  if (card.lastVerified) {
    const age = (today - new Date(card.lastVerified)) / 86400000;
    if (age > 120) errors.push(`${rel}: stale >120 days — verify or archive (CUR-7)`);
    else if (age > 90) warnings.push(`${rel}: verification due (>90 days)`);
  }
}

// ---------- quiz bank checks ----------
import { existsSync } from 'node:fs';
const quizDir = join(ROOT, 'content/quizzes');
if (existsSync(quizDir)) {
  for (const p of walk(quizDir, '.json')) {
    const rel = relative(ROOT, p);
    let bank;
    try { bank = JSON.parse(readFileSync(p, 'utf8')); }
    catch { errors.push(`${rel}: invalid JSON`); continue; }
    for (const k of ['module', 'title', 'passThreshold', 'drawCount', 'items'])
      if (!(k in bank)) errors.push(`${rel}: missing "${k}"`);
    if (Array.isArray(bank.items)) {
      if (bank.items.length < bank.drawCount)
        errors.push(`${rel}: bank smaller than drawCount`);
      if (bank.items.length < 10)
        warnings.push(`${rel}: bank has <10 items — thin for random draws`);
      const ids = new Set();
      for (const it of bank.items) {
        for (const k of ['id', 'q', 'options', 'answer', 'explain'])
          if (!(k in it)) errors.push(`${rel}:${it.id ?? '?'}: missing "${k}"`);
        if (ids.has(it.id)) errors.push(`${rel}: duplicate item id ${it.id}`);
        ids.add(it.id);
        if (!Array.isArray(it.options) || it.options.length < 3)
          errors.push(`${rel}:${it.id}: needs >=3 options`);
        if (typeof it.answer !== 'number' || it.answer < 0 || it.answer >= (it.options?.length ?? 0))
          errors.push(`${rel}:${it.id}: answer index out of range`);
        if (!it.explain || it.explain.length < 20)
          errors.push(`${rel}:${it.id}: explanation required (>=20 chars) — feedback is the pedagogy`);
      }
    }
  }
}

// ---------- changelog checks ----------
// /whats-new is the public record of content corrections, so a malformed or
// undated entry is a broken promise rather than a cosmetic bug.
const CHANGE_KINDS = ['New module','New lesson','Lesson corrected','Content updated',
  'Narration added','Withdrawn','Accessibility','Fixed'];
const changelogPath = join(ROOT, 'content/changelog.json');
if (existsSync(changelogPath)) {
  let log;
  try { log = JSON.parse(readFileSync(changelogPath, 'utf8')); }
  catch { errors.push('content/changelog.json: invalid JSON'); log = null; }
  if (log) {
    if (!Array.isArray(log.entries)) errors.push('content/changelog.json: missing "entries" array');
    else for (const e of log.entries) {
      const at = 'content/changelog.json:' + (e.date ?? '?');
      for (const k of ['date','kind','where','what'])
        if (!e[k]) errors.push(at + ': missing "' + k + '"');
      if (e.date && !/^\d{4}-\d{2}-\d{2}$/.test(e.date))
        errors.push(at + ': date must be YYYY-MM-DD');
      if (e.date && new Date(e.date) > today)
        errors.push(at + ': dated in the future');
      if (e.kind && !CHANGE_KINDS.includes(e.kind))
        errors.push(at + ': unknown kind "' + e.kind + '" (allowed: ' + CHANGE_KINDS.join(', ') + ')');
      if (e.what && e.what.length < 20)
        errors.push(at + ': "what" must explain the change, not just label it');
    }
  }
}

// ---------- canned case checks ----------
const cannedDir = join(ROOT, 'content/canned');
if (existsSync(cannedDir)) {
  for (const p of walk(cannedDir, '.json')) {
    const rel = relative(ROOT, p);
    if (rel.includes('_drafts')) continue;
    let doc;
    try { doc = JSON.parse(readFileSync(p, 'utf8')); }
    catch { errors.push(`${rel}: invalid JSON`); continue; }
    for (const cse of doc.cases ?? []) {
      for (const k of ['id', 'title', 'task', 'prompt', 'output', 'notes'])
        if (!(k in cse)) errors.push(`${rel}:${cse.id ?? '?'}: missing "${k}"`);
      if (!Array.isArray(cse.notes) || cse.notes.length < 1)
        errors.push(`${rel}:${cse.id}: at least one annotation note required`);
      if ((cse.promptWeak && !cse.outputWeak) || (!cse.promptWeak && cse.outputWeak))
        errors.push(`${rel}:${cse.id}: weak prompt and weak output must come as a pair`);
    }
  }
}

// ---------- report ----------
for (const w of warnings) console.log('WARN  ' + w);
for (const e of errors) console.log('ERROR ' + e);
console.log(`\n${lessonFiles.length} lessons, ${registryIds.size} registry cards checked — ` +
  `${errors.length} error(s), ${warnings.length} warning(s).`);
process.exit(errors.length ? 1 : 0);
