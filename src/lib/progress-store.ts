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

export function isComplete(slug: string): boolean {
  return Boolean(load().completions[slug]);
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
