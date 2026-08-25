/** localStorage adapter around progress-core (anonymous mode = default).
 *  Emits 'ol:progress' on any change, including settings. */
import {
  emptyState, completeLesson, totalXp, streak, weeklyStreak, level,
  earnedBadges, recordQuizPass, quizPassed,
  newCard, gradeCard, recordReviewSession,
} from './progress-core';

const KEY = 'ol.progress.v1';
const SETTINGS_KEY = 'ol.settings.v1';

export function load() {
  if (typeof localStorage === 'undefined') return emptyState();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    return parsed?.version === 1 ? parsed : emptyState();
  } catch { return emptyState(); }
}

function save(state: unknown) {
  localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent('ol:progress'));
}

export function markComplete(slug: string, hash: string) {
  save(completeLesson(load(), slug, hash, crypto.randomUUID(), new Date()));
  return summary();
}

/* ---------- lesson quiz attempts ----------
 * A lesson may only be marked complete once the learner has actually answered
 * its questions at least once. Clicking "Mark complete" without engaging with
 * anything was previously enough to earn XP and a tick, which made the tick
 * mean "I scrolled past this" rather than "I understood this".
 *
 * An ATTEMPT is recorded, never a score. The inline quizzes are formative —
 * getting one wrong and reading why is the pedagogy — so the gate is
 * engagement, not correctness. Requiring a right answer would push people to
 * guess until the button unlocked, which teaches the opposite of E1·L7.
 */
export function recordQuizAttempt(slug: string) {
  if (typeof localStorage === 'undefined') return;
  const raw = localStorage.getItem(SETTINGS_KEY);
  let s: Record<string, any> = {};
  try { s = raw ? JSON.parse(raw) : {}; } catch { /* reset */ }
  s.attempted = { ...(s.attempted ?? {}), [slug]: true };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent('ol:progress'));
}

export function hasAttemptedQuiz(slug: string): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}').attempted?.[slug] === true;
  } catch { return false; }
}

export function isComplete(slug: string): boolean {
  return Boolean(load().completions[slug]);
}

/** Merge server-pulled events/completions into local state. Idempotent:
 *  existing local event ids and completed slugs are never duplicated or
 *  overwritten. Used by sync.ts on sign-in / manual sync so a fresh device
 *  catches up with previously-synced progress (FR-AUTH-3, other half of the
 *  push path in sync.ts). */
export function mergeFromServer(
  pulledEvents: { id: string; kind: 'xp'; amount: number; reason: string; ref: string; at: string }[],
  pulledCompletions: Record<string, { hash: string; at: string }>,
): number {
  const state = load();
  const localIds = new Set(state.events.map((e: { id: string }) => e.id));
  const newEvents = pulledEvents.filter((e) => !localIds.has(e.id));

  const mergedCompletions = { ...state.completions };
  for (const [slug, c] of Object.entries(pulledCompletions)) {
    if (!mergedCompletions[slug]) mergedCompletions[slug] = c;
  }

  if (newEvents.length === 0 && Object.keys(mergedCompletions).length === Object.keys(state.completions).length) {
    return 0;
  }

  save({
    ...state,
    events: [...state.events, ...newEvents],
    completions: mergedCompletions,
  });
  return newEvents.length;
}

export type GoalMode = 'daily' | 'weekly';

export function goalMode(): GoalMode {
  if (typeof localStorage === 'undefined') return 'daily';
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}').goalMode === 'weekly'
      ? 'weekly' : 'daily';
  } catch { return 'daily'; }
}

export function setGoalMode(mode: GoalMode) {
  const raw = localStorage.getItem(SETTINGS_KEY);
  let s: Record<string, unknown> = {};
  try { s = raw ? JSON.parse(raw) : {}; } catch { /* reset */ }
  s.goalMode = mode;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent('ol:progress'));
}

/* ---------- read aloud ----------
 * Deliberately NOT part of READER_PREFS. Those are all one data-* attribute
 * driving CSS; this is a behaviour with no visual token behind it, and forcing
 * it into that mechanism would mean inventing a meaningless stylesheet rule to
 * satisfy the consistency test.
 */
export function readAloudEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}').readAloud === true;
  } catch { return false; }
}

export function setReadAloud(on: boolean) {
  const raw = localStorage.getItem(SETTINGS_KEY);
  let s: Record<string, any> = {};
  try { s = raw ? JSON.parse(raw) : {}; } catch { /* reset */ }
  s.readAloud = on;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent('ol:progress'));
}

/* ---------- reader preferences ----------
 * Each preference is one data-* attribute on <html>; tokens.css does the rest.
 * They live in the existing settings object rather than a second storage key,
 * so a learner's preferences travel with the rest of their local state.
 *
 * The DEFAULT value of every preference means "set no attribute at all", which
 * is what keeps the markup clean for the majority who never open the panel and
 * lets the OS decide the theme.
 *
 * IMPORTANT: the inline pre-paint script in src/layouts/Base.astro duplicates
 * this mapping deliberately — it must run before first paint, so it cannot
 * import this module. If you change a key, an attribute name or a default
 * here, change it there too. The test suite asserts the two agree. */
export const READER_PREFS = {
  theme:    { attr: 'data-theme',    values: ['system', 'light', 'dark'] },
  textsize: { attr: 'data-textsize', values: ['normal', 'large', 'xlarge'] },
  leading:  { attr: 'data-leading',  values: ['normal', 'tight', 'loose'] },
  width:    { attr: 'data-width',    values: ['normal', 'wide'] },
  contrast: { attr: 'data-contrast', values: ['normal', 'high'] },
  font:     { attr: 'data-font',     values: ['default', 'readable'] },
  saver:    { attr: 'data-saver',    values: ['off', 'on'] },
  motion:   { attr: 'data-motion',   values: ['system', 'reduce'] },
} as const;

export type ReaderPrefName = keyof typeof READER_PREFS;
export type ReaderPrefs = Record<ReaderPrefName, string>;

/** The first value of each list is the default, i.e. "no attribute". */
export function defaultReaderPrefs(): ReaderPrefs {
  const out = {} as ReaderPrefs;
  for (const k of Object.keys(READER_PREFS) as ReaderPrefName[]) {
    out[k] = READER_PREFS[k].values[0];
  }
  return out;
}

export function readerPrefs(): ReaderPrefs {
  const prefs = defaultReaderPrefs();
  if (typeof localStorage === 'undefined') return prefs;
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}').reader ?? {};
    for (const k of Object.keys(READER_PREFS) as ReaderPrefName[]) {
      // Ignore anything not in the allowed list, so a hand-edited or
      // corrupted value can never write junk into the DOM.
      if ((READER_PREFS[k].values as readonly string[]).includes(saved[k])) prefs[k] = saved[k];
    }
  } catch { /* fall back to defaults */ }
  return prefs;
}

/** Writes the attributes onto <html>. Defaults remove the attribute. */
export function applyReaderPrefs(prefs: ReaderPrefs, root?: HTMLElement) {
  const el = root ?? document.documentElement;
  for (const k of Object.keys(READER_PREFS) as ReaderPrefName[]) {
    const { attr, values } = READER_PREFS[k];
    if (prefs[k] === values[0]) el.removeAttribute(attr);
    else el.setAttribute(attr, prefs[k]);
  }
}

export function setReaderPref(name: ReaderPrefName, value: string) {
  if (!(READER_PREFS[name].values as readonly string[]).includes(value)) return;
  const raw = localStorage.getItem(SETTINGS_KEY);
  let s: Record<string, any> = {};
  try { s = raw ? JSON.parse(raw) : {}; } catch { /* reset */ }
  s.reader = { ...(s.reader ?? {}), [name]: value };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  applyReaderPrefs(readerPrefs());
  window.dispatchEvent(new CustomEvent('ol:progress'));
}

export function passQuiz(moduleId: string, score: number) {
  save(recordQuizPass(load(), moduleId, score, crypto.randomUUID(), new Date()));
}

export function hasPassedQuiz(moduleId: string): boolean {
  return quizPassed(load(), moduleId);
}

export function badges(moduleTotals: Record<string, number>): string[] {
  return earnedBadges(load(), new Date(), moduleTotals);
}

export function summary() {
  const s = load();
  const xp = totalXp(s);
  const mode = goalMode();
  return {
    xp, level: level(xp), mode,
    streak: mode === 'weekly' ? weeklyStreak(s, new Date()) : streak(s, new Date()),
    lessons: Object.keys(s.completions).length,
  };
}

/* ---------------- SRS store (separate key; mirrors server srs_cards) ------ */
const SRS_KEY = 'ol.srs.v1';

export interface CardDef {
  key: string;            // lessonSlug#index
  front: string; back: string;
  lessonSlug: string; lessonTitle: string;
}

function srsLoad(): Record<string, any> {
  if (typeof localStorage === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(SRS_KEY) ?? '{}'); }
  catch { return {}; }
}

function srsSave(map: Record<string, any>) {
  localStorage.setItem(SRS_KEY, JSON.stringify(map));
}

/** Session pool: cards whose lesson is completed; due (or new) first,
 *  capped at 30 (Phase 6 §3.8). */
export function sessionCards(all: CardDef[], limit = 30): { def: CardDef; state: any; isNew: boolean }[] {
  const completions = load().completions;
  const map = srsLoad();
  const now = Date.now();
  const pool = all
    .filter((d) => completions[d.lessonSlug])
    .map((d) => {
      const state = map[d.key];
      return { def: d, state: state ?? null, isNew: !state };
    })
    .filter((c) => c.isNew || new Date(c.state.dueAt).getTime() <= now)
    .sort((a, b) => {
      if (a.isNew !== b.isNew) return a.isNew ? 1 : -1;           // overdue before new
      if (a.isNew) return 0;
      return new Date(a.state.dueAt).getTime() - new Date(b.state.dueAt).getTime();
    });
  return pool.slice(0, limit);
}

export function dueCount(all: CardDef[]): number {
  return sessionCards(all, 1000).length;
}

export function gradeAndSave(key: string, grade: 'again' | 'hard' | 'good' | 'easy') {
  const map = srsLoad();
  const now = new Date();
  map[key] = gradeCard(map[key] ?? newCard(now), grade, now);
  srsSave(map);
}

/** Award the daily review XP (idempotent per activity day) — also marks
 *  the streak day, since streaks derive from events. */
export function finishReviewSession() {
  save(recordReviewSession(load(), crypto.randomUUID(), new Date()));
}
