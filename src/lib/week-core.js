/** "Your week" — the Mon–Sun panel from design turn 7 (/home).
 *
 *  Pure functions over the same event log the streak already uses, so the
 *  panel can never disagree with the streak chip: both read `state.events`.
 *
 *  Two honesty rules are baked in here rather than left to the UI:
 *
 *  1. A day with no activity renders as an em dash, never a zero. The design
 *     is explicit that "a gap is not a failure", and a column of 0s reads as
 *     failure in a way that a blank does not.
 *
 *  2. Minutes are ESTIMATED from lesson length and cards reviewed. Lrnon does
 *     not time anyone. The design's own board copy says points come from
 *     "lessons, quizzes and review cards — not from time spent on the site",
 *     so a real timer would contradict the product. The estimate is labelled
 *     as an estimate wherever it is shown.
 */

import { activityDate } from './progress-core.js';

/** Seconds of study credited per flashcard graded. A card is a few seconds of
 *  recall plus the pause before it; 15s is deliberately conservative, so the
 *  estimate under-reports rather than flatters. */
export const SECONDS_PER_CARD = 15;

/** The seven activity-dates of the ISO week (Mon→Sun) containing `now`.
 *  Uses the same 4am day boundary as the streak, so a lesson finished at
 *  1am Tuesday lands on Monday in BOTH the streak and this panel.
 *  @param {Date} now @returns {string[]} */
export function weekDates(now) {
  const today = activityDate(now);
  const [y, m, d] = today.split('-').map(Number);
  // Work in UTC from the already-shifted date so DST cannot move a column.
  const anchor = Date.UTC(y, m - 1, d);
  const dow = new Date(anchor).getUTCDay() || 7;          // Mon=1..Sun=7
  const monday = anchor - (dow - 1) * 86400000;
  return Array.from({ length: 7 }, (_, i) => {
    const t = new Date(monday + i * 86400000);
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
  });
}

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Aggregate one week.
 *
 *  @param {{events: {reason: string, ref?: string, at: string}[]}} state
 *  @param {Record<string, number>} reviewLog  cards graded, keyed by activity date
 *  @param {Record<string, number>} lessonMinutes  slug -> minutes, from frontmatter
 *  @param {Date} now
 *  @returns {{
 *    dates: string[], labels: string[], today: string,
 *    rows: {key: string, label: string, values: (number|null)[], total: number}[],
 *    restDays: number, activeDays: number
 *  }}
 */
export function weekSummary(state, reviewLog, lessonMinutes, now) {
  const dates = weekDates(now);
  const idx = new Map(dates.map((d, i) => [d, i]));
  const zeros = () => Array(7).fill(0);

  const lessons = zeros();
  const quizzes = zeros();
  const cards = zeros();
  const minutes = zeros();

  for (const e of state.events ?? []) {
    const i = idx.get(activityDate(new Date(e.at)));
    if (i === undefined) continue;
    if (e.reason === 'lesson_complete') {
      lessons[i] += 1;
      // Unknown slugs (a lesson since renamed) contribute nothing rather than
      // a guessed default — an invented number is worse than a small one.
      minutes[i] += lessonMinutes[e.ref] ?? 0;
    } else if (e.reason === 'module_quiz_pass') {
      quizzes[i] += 1;
    }
  }

  for (const [date, n] of Object.entries(reviewLog ?? {})) {
    const i = idx.get(date);
    if (i === undefined) continue;
    cards[i] += n;
    minutes[i] += (n * SECONDS_PER_CARD) / 60;
  }

  // A day is "active" if anything at all happened on it. That single test
  // drives both the em dashes and the rest-day sentence, so they cannot drift.
  const active = dates.map((_, i) => lessons[i] + quizzes[i] + cards[i] > 0);
  const blank = (arr) => arr.map((v, i) => (active[i] ? v : null));
  const sum = (arr) => arr.reduce((a, b) => a + b, 0);

  return {
    dates,
    labels: DAY_LABELS,
    today: activityDate(now),
    activeDays: active.filter(Boolean).length,
    restDays: active.filter((a) => !a).length,
    rows: [
      { key: 'lessons', label: 'Lessons read',  values: blank(lessons), total: sum(lessons) },
      { key: 'quizzes', label: 'Quizzes passed', values: blank(quizzes), total: sum(quizzes) },
      { key: 'cards',   label: 'Review cards',   values: blank(cards),   total: sum(cards) },
      {
        key: 'minutes', label: 'Minutes',
        values: blank(minutes.map((m) => Math.round(m))),
        total: Math.round(sum(minutes)),
      },
    ],
  };
}

/** The sentence under the grid. The design supplies the two-rest-day case;
 *  the others exist because a panel that only knows one situation says the
 *  wrong thing in every other one — telling somebody with a perfect week that
 *  "a gap is not a failure" is noise, and telling somebody with an empty week
 *  the same is worse.
 *  @param {{restDays: number, activeDays: number}} w */
export function weekNote(w) {
  if (w.activeDays === 0) {
    return 'Nothing yet this week. One lesson is enough to start it off.';
  }
  if (w.restDays === 0) {
    return 'Every day this week. Rest is allowed too — the streak survives a day off.';
  }
  const n = w.restDays === 1 ? 'One rest day' : `${w.restDays} rest days`;
  return `${n} this week. A gap is not a failure — the streak counts weeks you came back, not days you never missed.`;
}

/** "Good evening, quiet-fern". Local hours, because the greeting is about the
 *  reader's evening and not the server's.
 *  @param {Date} now @returns {'Good morning'|'Good afternoon'|'Good evening'} */
export function greeting(now) {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
