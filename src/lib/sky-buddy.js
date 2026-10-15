/** Sky the companion — what Sky says and suggests, derived from real progress.
 *
 *  Sky has two jobs on this site and they are kept apart on purpose.
 *
 *    1. THE ASSISTANT answers questions from Lrnon's own pages. It costs money,
 *       sends text to an outside provider, and is gated by rollout stage. That
 *       code is in /api/sky and is unchanged by this file.
 *
 *    2. THE COMPANION is the face on every page: a greeting, a next step, and a
 *       plain view of progress. It sends nothing anywhere, costs nothing, and is
 *       for everyone.
 *
 *  This file is the companion's whole brain, as pure functions with no browser
 *  or storage access, so the rules below can be tested rather than hoped for.
 *
 *  THE RULE: every mechanic here exists to help someone learn, not to bring them
 *  back. Concretely, and each of these is enforced by scripts/test-sky-buddy.mjs:
 *
 *    · It never awards anything. XP, streaks and badges come from finishing a
 *      lesson, passing a quiz or doing a review, in progress-core. Opening Sky,
 *      reading it, or tapping around earns nothing, so there is nothing to farm.
 *    · It suggests the next useful step and says how long it takes. It does not
 *      invent urgency, and it never talks about losing, missing or breaking.
 *    · It does not compare anyone with anyone. There is no leaderboard, because
 *      ranking learners means exposing them to each other, which the child-safety
 *      page rules out, and because "better than others" is not a reason to learn.
 *    · It never asks for money. Support lives on one page, linked from the footer.
 *    · It has no timers and no countdowns.
 */
import { streak, weeklyStreak, totalXp, level, BADGES, earnedBadges } from './progress-core.js';
import { SECONDS_PER_CARD, greeting } from './week-core.js';

/** The commitments above as data, so a test can read them and the UI can state
 *  them. Changing one of these is a policy change, not a tweak. */
export const COMPANION_POLICY = Object.freeze({
  awardsProgress: false,
  comparesLearners: false,
  asksForMoney: false,
  usesTimers: false,
  sendsDataAnywhere: false,
});

/** Words the companion's own messages must never contain. A message that uses
 *  one is urgency or guilt dressed up as encouragement. */
export const FORBIDDEN_TONE = [
  'lose', 'lost', 'losing', 'miss', 'missed', 'missing', 'break', 'broken', 'hurry',
  'last chance', 'expire', 'expires', 'expiring', 'running out', "don't forget", 'behind',
  'fail', 'failed', 'failure', 'disappoint', 'donate', 'support us', 'upgrade', 'premium',
];

const mins = (seconds) => Math.max(1, Math.round(seconds / 60));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Which module a slug belongs to: 'explorer/e7/l3-…' -> 'e7'. */
const moduleOf = (slug) => slug.split('/')[1];

/** Count of review cards that are new or due, from completed lessons only —
 *  the same rule the review page uses.
 *  @param {{s:string,c:number}[]} lessons
 *  @param {Record<string,true|object>} completions
 *  @param {Record<string,{dueAt:string}>} srs
 *  @param {Date} now */
export function dueCards(lessons, completions, srs, now) {
  let n = 0;
  for (const l of lessons) {
    if (!completions[l.s]) continue;
    for (let i = 0; i < l.c; i++) {
      const st = srs[`${l.s}#${i}`];
      if (!st || new Date(st.dueAt).getTime() <= now.getTime()) n++;
    }
  }
  return n;
}

/** The learner's real position, summarised.
 *  @param {object} index  public/buddy-index.json
 *  @param {object} state  progress state (ol.progress.v1)
 *  @param {Record<string,object>} srs
 *  @param {Date} now
 *  @param {'daily'|'weekly'} goalMode */
export function companionContext(index, state, srs, now, goalMode = 'daily') {
  const lessons = index?.lessons ?? [];
  const done = state?.completions ?? {};
  const xp = totalXp(state ?? { events: [] });
  const lv = level(xp);
  const days = goalMode === 'weekly' ? weeklyStreak(state, now) : streak(state, now);

  const doneCount = lessons.filter((l) => done[l.s]).length;
  const next = lessons.find((l) => !done[l.s]) ?? null;

  /* A module the learner has fully read, whose quiz they have not passed. The
     quiz is a good next step precisely then: it checks what was just learned.
     No stakes, unlimited retries (the quiz page says so itself). */
  const passed = new Set((state?.events ?? []).filter((e) => e.reason === 'module_quiz_pass').map((e) => e.ref));
  let quizModule = null;
  for (const m of index?.quizzes ?? []) {
    const inMod = lessons.filter((l) => l.m === m);
    if (inMod.length && inMod.every((l) => done[l.s]) && !passed.has(m)) { quizModule = m; break; }
  }

  const due = dueCards(lessons, done, srs ?? {}, now);
  const lastSlug = Object.entries(done)
    .map(([slug, c]) => [slug, c?.at ?? ''])
    .sort((a, b) => String(b[1]).localeCompare(String(a[1])))[0]?.[0] ?? null;

  const nextLevelAt = 25 * lv * lv;
  const moduleTotals = {};
  for (const l of lessons) moduleTotals[l.m] = (moduleTotals[l.m] ?? 0) + 1;
  const badgesEarned = earnedBadges(state ?? { events: [], completions: {} }, now, moduleTotals);
  const nextBadge = BADGES.find((b) => !badgesEarned.includes(b.id)) ?? null;

  return {
    now, xp, level: lv, xpIntoLevel: xp - 25 * (lv - 1) * (lv - 1), xpForLevel: nextLevelAt - 25 * (lv - 1) * (lv - 1),
    streakDays: days, goalMode,
    lessonsDone: doneCount, lessonsTotal: lessons.length,
    next, quizModule, quizModuleTitle: quizModule ? index.modules?.[quizModule] : null,
    due, lastModule: lastSlug ? moduleOf(lastSlug) : null,
    badgesEarned: badgesEarned.length, badgesTotal: BADGES.length, nextBadge,
  };
}

/** What Sky says, and the one step it suggests.
 *  Returns { hello, say, step, why } where `step` is { label, href } or null.
 *  @param {ReturnType<typeof companionContext>} c
 *  @param {{ numbers?: boolean }} opts  numbers=false hides streak/XP talk entirely */
export function companionSays(c, { numbers = true } = {}) {
  const hello = greeting(c.now);
  const streakLine = numbers && c.streakDays >= 2
    ? ` You have learned ${plural(c.streakDays, c.goalMode === 'weekly' ? 'week' : 'day', c.goalMode === 'weekly' ? 'weeks' : 'days')} in a row.`
    : '';

  // First visit, or nothing finished yet: one short lesson, nothing else.
  if (c.lessonsDone === 0) {
    const l = c.next;
    return {
      hello: 'Hi, I am Sky',
      say: l
        ? `I am your study buddy. A good place to start is "${l.t}". It takes about ${plural(l.min, 'minute', 'minutes')}.`
        : 'I am your study buddy.',
      step: l ? { label: `Start: ${l.t}`, href: `/learn/${l.s}` } : { label: 'See the roadmap', href: '/roadmap' },
      why: l ? `About ${plural(l.min, 'minute', 'minutes')}. No sign-up needed.` : '',
    };
  }

  // A module just finished: the quiz checks it while it is fresh.
  if (c.quizModule) {
    return {
      hello,
      say: `You have read all of ${c.quizModuleTitle}. The module quiz is a good way to check it stuck. It has no stakes and you can retry as often as you like.${streakLine}`,
      step: { label: `Quiz me on ${c.quizModuleTitle}`, href: `/quiz/${c.quizModule}` },
      why: 'Eight questions, with an explanation after each.',
    };
  }

  // Cards ready: spaced review is the single best use of a few minutes.
  if (c.due > 0) {
    const m = mins(c.due * SECONDS_PER_CARD);
    return {
      hello,
      say: `${plural(c.due, 'card is', 'cards are')} ready to review. It takes about ${plural(m, 'minute', 'minutes')}. Going back over things is what makes them stay.${streakLine}`,
      step: { label: `Review ${plural(c.due, 'card', 'cards')}`, href: '/review' },
      why: `About ${plural(m, 'minute', 'minutes')}.`,
    };
  }

  if (c.next) {
    return {
      hello,
      say: `Next in your path: "${c.next.t}", about ${plural(c.next.min, 'minute', 'minutes')}.${streakLine}`,
      step: { label: `Continue: ${c.next.t}`, href: `/learn/${c.next.s}` },
      why: `About ${plural(c.next.min, 'minute', 'minutes')}.`,
    };
  }

  return {
    hello,
    say: 'You have finished everything that is live so far. New lessons are added over time. Reviewing old cards is a good use of any spare minutes.',
    step: { label: 'See the roadmap', href: '/roadmap' },
    why: '',
  };
}

/** The "my progress" view. Plain facts; no ranking, no targets set for you.
 *  @param {ReturnType<typeof companionContext>} c */
export function progressFacts(c) {
  const rows = [
    { k: 'Lessons finished', v: `${c.lessonsDone} of ${c.lessonsTotal}` },
    { k: c.goalMode === 'weekly' ? 'Weeks in a row' : 'Days in a row', v: String(c.streakDays) },
    { k: 'Level', v: `${c.level} (${c.xpIntoLevel} of ${c.xpForLevel} points towards the next)` },
    { k: 'Badges', v: `${c.badgesEarned} of ${c.badgesTotal}` },
  ];
  return {
    rows,
    levelPercent: Math.min(100, Math.round((c.xpIntoLevel / c.xpForLevel) * 100)),
    nextBadge: c.nextBadge ? { name: c.nextBadge.name, desc: c.nextBadge.desc } : null,
    note: 'Lrnon does not rank learners or compare you with anyone. These numbers are only about you.',
  };
}

/** True if a message breaks the tone rule. Used by tests, and by the component
 *  in development to refuse to render anything that fails it. */
export function breaksToneRule(text) {
  const t = String(text);
  return FORBIDDEN_TONE.find((w) => new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(t)) ?? null;
}
