#!/usr/bin/env node
/**
 * Content & registry linter — Sprint 1 (FR-CONT-1, CUR-2/3/7 subset).
 * Dependency-free by design: runs before npm install in CI cold starts.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

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
