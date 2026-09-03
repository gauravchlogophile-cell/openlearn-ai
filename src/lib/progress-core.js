/** Anonymous-first progress core — pure functions, no browser APIs.
 *  Plain ESM + JSDoc so Node tests import it directly (no build step).
 *  Mirrors the server model (Phase 6): append-only events, derived totals,
 *  idempotency by eventId. Journey J2 merges this shape into Supabase.
 *
 * @typedef {{id:string, kind:'xp', amount:number, reason:string, ref:string, at:string}} RewardEvent
 * @typedef {{version:1, events:RewardEvent[], completions:Record<string,{hash:string,at:string}>}} ProgressState
 */

export const XP_LESSON_COMPLETE = 10;
export const XP_MODULE_QUIZ = 30;
export const XP_REVIEW_SESSION = 5;

/** @returns {ProgressState} */
export function emptyState() {
  return { version: 1, events: [], completions: {} };
}

/** Idempotent: completing an already-completed lesson changes nothing.
 * @param {ProgressState} state @param {string} slug @param {string} hash
 * @param {string} eventId @param {Date} now @returns {ProgressState} */
export function completeLesson(state, slug, hash, eventId, now) {
  if (state.completions[slug]) return state;
  if (state.events.some((e) => e.id === eventId)) return state;
  return {
    ...state,
    completions: { ...state.completions, [slug]: { hash, at: now.toISOString() } },
    events: [...state.events, {
      id: eventId, kind: 'xp', amount: XP_LESSON_COMPLETE,
      reason: 'lesson_complete', ref: slug, at: now.toISOString(),
    }],
  };
}

/** One pass award per module, idempotent by eventId AND by (reason, ref).
 * @param {ProgressState} state @param {string} moduleId @param {number} score
 * @param {string} eventId @param {Date} now @returns {ProgressState} */
export function recordQuizPass(state, moduleId, _score, eventId, now) {
  if (quizPassed(state, moduleId)) return state;
  if (state.events.some((e) => e.id === eventId)) return state;
  return {
    ...state,
    events: [...state.events, {
      id: eventId, kind: 'xp', amount: XP_MODULE_QUIZ,
      reason: 'module_quiz_pass', ref: moduleId, at: now.toISOString(),
    }],
  };
}

/** @param {ProgressState} state @param {string} moduleId */
export function quizPassed(state, moduleId) {
  return state.events.some((e) => e.reason === 'module_quiz_pass' && e.ref === moduleId);
}

/** @param {ProgressState} state */
export function totalXp(state) {
  return state.events.reduce((sum, e) => sum + e.amount, 0);
}

/** Mirrors SQL level_for_xp(). @param {number} xp */
export function level(xp) {
  return Math.max(1, Math.floor(Math.sqrt(xp / 25)) + 1);
}

/** Local activity date with the 4am cutoff (Phase 6 §3.4). @param {Date} at */
export function activityDate(at) {
  const s = new Date(at.getTime() - 4 * 3600_000);
  return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`;
}

/** ISO week id like "2026-W28", applied AFTER the 4am shift. @param {Date} at */
export function isoWeek(at) {
  const d = new Date(at.getTime() - 4 * 3600_000);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;                 // Mon=1..Sun=7
  t.setUTCDate(t.getUTCDate() + 4 - day);         // nearest Thursday
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function prevIsoWeek(weekId) {
  const [y, w] = weekId.split('-W').map(Number);
  // walk back via a date in that week: Jan 4 is always week 1
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const week1Mon = new Date(jan4.getTime() - (day - 1) * 86400000);
  const mon = new Date(week1Mon.getTime() + (w - 1) * 7 * 86400000);
  const prevThu = new Date(mon.getTime() - 4 * 86400000);
  return isoWeek(new Date(prevThu.getTime() + 4 * 3600_000)); // undo shift
}

/** Daily streak = consecutive activity days ending today or yesterday.
 * @param {ProgressState} state @param {Date} now */
export function streak(state, now) {
  const days = new Set(state.events.map((e) => activityDate(new Date(e.at))));
  if (days.size === 0) return 0;
  const dayMs = 86400000;
  let cursor = activityDate(now);
  if (!days.has(cursor)) {
    const yesterday = activityDate(new Date(now.getTime() - dayMs));
    if (!days.has(yesterday)) return 0;
    cursor = yesterday;
  }
  let count = 0;
  let t = new Date(cursor + 'T12:00:00');
  while (days.has(activityDate(new Date(t.getTime() + 13 * 3600_000)))) {
    count += 1;
    t = new Date(t.getTime() - dayMs);
  }
  return count;
}

/** Weekly streak = consecutive ISO weeks with activity, ending this week or
 *  last week (goal_mode='weekly', Phase 3 §7.4). @param {ProgressState} state @param {Date} now */
export function weeklyStreak(state, now) {
  const weeks = new Set(state.events.map((e) => isoWeek(new Date(e.at))));
  if (weeks.size === 0) return 0;
  let cursor = isoWeek(now);
  if (!weeks.has(cursor)) {
    const prev = prevIsoWeek(cursor);
    if (!weeks.has(prev)) return 0;
    cursor = prev;
  }
  let count = 0;
  while (weeks.has(cursor)) { count += 1; cursor = prevIsoWeek(cursor); }
  return count;
}


/* ---------------- Spaced repetition (SM-2 variant, Phase 6 §3.8) ---------- */

/** @typedef {{ease:number, intervalDays:number, dueAt:string, reps:number, lapses:number}} SrsCard */

/** @param {Date} now @returns {SrsCard} */
export function newCard(now) {
  return { ease: 2.5, intervalDays: 0, dueAt: now.toISOString(), reps: 0, lapses: 0 };
}

/** Grade a card: 'again' | 'hard' | 'good' | 'easy'.
 * Again → lapse, interval 1d, ease −0.2 (floor 1.3)
 * Hard  → interval ×1.2 (min 1d), ease −0.05 (floor 1.3)
 * Good  → 1d, 6d, then interval × ease
 * Easy  → interval × ease × 1.3 (min 4d), ease +0.05 (cap 3.0)
 * @param {SrsCard} card @param {'again'|'hard'|'good'|'easy'} grade @param {Date} now
 * @returns {SrsCard} */
export function gradeCard(card, grade, now) {
  let { ease, intervalDays, reps, lapses } = card;
  if (grade === 'again') {
    lapses += 1; reps = 0; intervalDays = 1;
    ease = Math.max(1.3, ease - 0.2);
  } else if (grade === 'hard') {
    reps += 1; intervalDays = Math.max(1, intervalDays * 1.2);
    ease = Math.max(1.3, ease - 0.05);
  } else if (grade === 'good') {
    reps += 1;
    intervalDays = reps === 1 ? 1 : reps === 2 ? 6 : intervalDays * ease;
  } else { // easy
    reps += 1;
    intervalDays = Math.max(4, (intervalDays || 1) * ease * 1.3);
    ease = Math.min(3.0, ease + 0.05);
  }
  intervalDays = Math.min(3650, Math.round(intervalDays * 100) / 100); // 10y cap (Anki-style)
  const dueAt = new Date(now.getTime() + intervalDays * 86400000).toISOString();
  return { ease: Math.round(ease * 100) / 100, intervalDays, dueAt, reps, lapses };
}

/** Preview intervals for the four grades (for button labels).
 * @param {SrsCard} card @param {Date} now */
export function previewIntervals(card, now) {
  const label = (d) => d < 1.5 ? '1d' : d < 30 ? Math.round(d) + 'd' : Math.round(d / 30) + 'mo';
  return {
    again: '1d',
    hard: label(gradeCard(card, 'hard', now).intervalDays),
    good: label(gradeCard(card, 'good', now).intervalDays),
    easy: label(gradeCard(card, 'easy', now).intervalDays),
  };
}

/** One review-session XP award per activity day, idempotent both ways.
 * @param {ProgressState} state @param {string} eventId @param {Date} now
 * @returns {ProgressState} */
export function recordReviewSession(state, eventId, now) {
  const day = activityDate(now);
  if (state.events.some((e) => e.reason === 'review_session' && e.ref === day)) return state;
  if (state.events.some((e) => e.id === eventId)) return state;
  return {
    ...state,
    events: [...state.events, {
      id: eventId, kind: 'xp', amount: XP_REVIEW_SESSION,
      reason: 'review_session', ref: day, at: now.toISOString(),
    }],
  };
}

/** Badge catalog — criteria are PUBLIC (ethical-gamification policy §7.1/7.5).
 *  check(ctx) where ctx = {state, now, xp, lessons, dailyStreak, weeklyStreak, moduleTotals} */
export const BADGES = [
  { id: 'first-steps',    name: 'First Steps',      desc: 'Complete your first lesson.',              check: (c) => c.lessons >= 1 },
  { id: 'getting-into-it',name: 'Getting Into It',  desc: 'Complete 5 lessons.',                      check: (c) => c.lessons >= 5 },
  { id: 'double-digits',  name: 'Double Digits',    desc: 'Complete 10 lessons.',                     check: (c) => c.lessons >= 10 },
  { id: 'foundation-laid',name: 'Foundation Laid',  desc: 'Complete every lesson in module E1.',      check: (c) => moduleDone(c, 'e1') },
  { id: 'tool-scout',     name: 'Tool Scout',       desc: 'Complete every lesson in module E2.',      check: (c) => moduleDone(c, 'e2') },
  { id: 'back-tomorrow',  name: 'Back Tomorrow',    desc: 'Reach a 2-day streak.',                    check: (c) => c.dailyStreak >= 2 },
  { id: 'warming-up',     name: 'Warming Up',       desc: 'Reach a 3-day streak.',                    check: (c) => c.dailyStreak >= 3 },
  { id: 'one-week-strong',name: 'One Week Strong',  desc: 'Reach a 7-day streak.',                    check: (c) => c.dailyStreak >= 7 },
  { id: 'steady-weeks',   name: 'Steady Weeks',     desc: 'Learn in 3 consecutive weeks (any pace).', check: (c) => c.weeklyStreak >= 3 },
  { id: 'spark',          name: 'Spark',            desc: 'Earn 50 XP.',                              check: (c) => c.xp >= 50 },
  { id: 'century',        name: 'Century',          desc: 'Earn 100 XP.',                             check: (c) => c.xp >= 100 },
  { id: 'early-bird',     name: 'Early Bird',       desc: 'Complete a lesson before 8am.',            check: (c) => c.state.events.some((e) => localHour(e.at) < 8 && localHour(e.at) >= 4) },
  { id: 'reviewer',       name: 'Reviewer',         desc: 'Complete a flashcard review session.',    check: (c) => c.state.events.some((e) => e.reason === 'review_session') },
  { id: 'memory-keeper',  name: 'Memory Keeper',    desc: 'Complete review sessions on 5 different days.', check: (c) => c.state.events.filter((e) => e.reason === 'review_session').length >= 5 },
  { id: 'proven-foundation', name: 'Proven Foundation', desc: 'Pass the E1 module quiz (80%+).', check: (c) => c.state.events.some((e) => e.reason === 'module_quiz_pass' && e.ref === 'e1') },
  { id: 'proven-scout',   name: 'Proven Scout',     desc: 'Pass the E2 module quiz (80%+).', check: (c) => c.state.events.some((e) => e.reason === 'module_quiz_pass' && e.ref === 'e2') },
  { id: 'night-owl',      name: 'Night Owl',        desc: 'Complete a lesson after 10pm.',            check: (c) => c.state.events.some((e) => localHour(e.at) >= 22) },
];

function localHour(iso) { return new Date(iso).getHours(); }
function moduleDone(c, mod) {
  const total = c.moduleTotals?.[mod];
  if (!total) return false;
  const done = Object.keys(c.state.completions)
    .filter((slug) => slug.split('/')[1] === mod).length;
  return done >= total;
}

/** @param {ProgressState} state @param {Date} now @param {Record<string,number>} moduleTotals */
export function earnedBadges(state, now, moduleTotals) {
  const ctx = {
    state, now, moduleTotals,
    xp: totalXp(state),
    lessons: Object.keys(state.completions).length,
    dailyStreak: streak(state, now),
    weeklyStreak: weeklyStreak(state, now),
  };
  return BADGES.filter((b) => b.check(ctx)).map((b) => b.id);
}
