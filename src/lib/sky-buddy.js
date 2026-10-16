/** Sky the companion — what Sky says and suggests, derived from real progress.
 *
 *  Sky has two jobs on this site and they are kept apart on purpose.
 *
 *    1. THE ASSISTANT answers questions from Lrnon's own pages. It costs money,
 *       sends text to an outside provider, and is gated by rollout stage. That
 *       code is in /api/sky and is unchanged by this file.
 *
 *    2. THE COMPANION is the face on every page: a greeting, a next step, a view
 *       of progress, practice, a board and cheers. It costs nothing, and apart
 *       from the opt-in board it sends nothing anywhere.
 *
 *  This file is the companion's brain, as pure functions with no browser or
 *  storage access, so its rules can be tested rather than hoped for.
 *
 *  THE RULES, as the owner set them on 16 October 2026 (replacing the stricter
 *  set of the day before, which had Sky award nothing, never mention a streak and
 *  have no board): engagement is for learning, AND for keeping a learner learning
 *  over the long run. So:
 *
 *    · Sky CHEERS. Opening it earns no points, but it greets you with a boost and
 *      cheers when you finish something. Points still come only from learning.
 *    · Sky DOES talk about a streak, including that one is about to end or has.
 *      It says so plainly, with a number and a way to keep it. It never shames,
 *      never scolds and never pretends the clock is shorter than it is.
 *    · There IS a board, and timers and countdowns. The board is opt-in, with
 *      generated handles and no learner-written text; made-up practice pals are
 *      labelled as exactly that. The timer on a quick quiz can be switched off
 *      and its end is a prompt, never a cut-off.
 *    · Sky never asks for money.
 *    · Every one of these can be switched off by the person it is aimed at.
 *
 *  What would turn this from a study buddy into a trap is left out on purpose:
 *  no shaming language, no fake scarcity, no streak that a tap can keep alive (a
 *  bonus star is not learning), nothing that asks a learner to compare themselves
 *  with a real person without having joined.
 */
import { streak, weeklyStreak, totalXp, level, BADGES, earnedBadges, activeToday, msUntilDayEnds, lastRunLength } from './progress-core.js';
import { SECONDS_PER_CARD, greeting } from './week-core.js';

/** The rules above as data, so a test can read them and the UI can state them. */
export const COMPANION_POLICY = Object.freeze({
  cheers: true,
  openingEarnsPoints: false,        // a cheer is not a reward
  talksAboutStreaks: true,
  boardIsOptIn: true,
  palsAreLabelled: true,
  timersAreOptional: true,
  asksForMoney: false,
  sendsDataAnywhere: 'only the opt-in board and the question-answering assistant',
  everythingCanBeSwitchedOff: true,
});

/** Words Sky's own messages must never contain: shame, scolding and pressure
 *  dressed up as encouragement. Talking about a streak is allowed; being cruel
 *  about one is not. */
export const FORBIDDEN_TONE = [
  'shame', 'ashamed', 'disappoint', 'disappointed', 'disappointing', 'pathetic', 'lazy', 'give up', 'giving up',
  'let down', 'failure', 'failed', 'last chance', 'hurry', 'don\'t forget', 'everyone else', 'falling behind',
  'donate', 'support us', 'upgrade', 'premium',
];

/** Streak lengths worth a cheer. */
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100];

const mins = (seconds) => Math.max(1, Math.round(seconds / 60));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const moduleOf = (slug) => slug.split('/')[1];

/** "5 h 12 min", "42 min". */
export function formatLeft(ms) {
  const total = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(total / 60), m = total % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

/** Count of review cards that are new or due, from completed lessons only —
 *  the same rule the review page uses. */
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

/** The learner's real position, summarised. */
export function companionContext(index, state, srs, now, goalMode = 'daily') {
  const lessons = index?.lessons ?? [];
  const done = state?.completions ?? {};
  const st = state ?? { events: [], completions: {} };
  const xp = totalXp(st);
  const lv = level(xp);
  const days = goalMode === 'weekly' ? weeklyStreak(st, now) : streak(st, now);

  const doneCount = lessons.filter((l) => done[l.s]).length;
  const next = lessons.find((l) => !done[l.s]) ?? null;

  const passed = new Set((st.events ?? []).filter((e) => e.reason === 'module_quiz_pass').map((e) => e.ref));
  let quizModule = null;
  for (const m of index?.quizzes ?? []) {
    const inMod = lessons.filter((l) => l.m === m);
    if (inMod.length && inMod.every((l) => done[l.s]) && !passed.has(m)) { quizModule = m; break; }
  }

  const due = dueCards(lessons, done, srs ?? {}, now);
  const lastSlug = Object.entries(done)
    .map(([slug, c]) => [slug, c?.at ?? ''])
    .sort((a, b) => String(b[1]).localeCompare(String(a[1])))[0]?.[0] ?? null;

  const base = 25 * (lv - 1) * (lv - 1);
  const nextLevelAt = 25 * lv * lv;
  const moduleTotals = {};
  for (const l of lessons) moduleTotals[l.m] = (moduleTotals[l.m] ?? 0) + 1;
  const badgesEarnedIds = earnedBadges(st, now, moduleTotals);
  const nextBadge = BADGES.find((b) => !badgesEarnedIds.includes(b.id)) ?? null;

  return {
    now, xp, level: lv, xpIntoLevel: xp - base, xpForLevel: nextLevelAt - base,
    streakDays: days, goalMode,
    doneToday: activeToday(st, now),
    msLeftToday: msUntilDayEnds(now),
    lastRun: lastRunLength(st, now),
    lessonsDone: doneCount, lessonsTotal: lessons.length,
    next, quizModule, quizModuleTitle: quizModule ? index.modules?.[quizModule] : null,
    due, lastModule: lastSlug ? moduleOf(lastSlug) : null,
    badgesEarned: badgesEarnedIds.length, badgesTotal: BADGES.length, badgesEarnedIds, nextBadge,
    stars: doneCount + passed.size,
  };
}

/** What Sky says about the learner's streak, or null if there is nothing to say.
 *
 *  Three situations, and in each Sky says what is true, with the number, and what
 *  would help:
 *    · alive and safe today          -> nothing, or a milestone cheer
 *    · alive but not yet kept today  -> "ends in 5 h 12 min; one lesson or review keeps it"
 *    · just ended                    -> "ended at 7 days; it happens to everyone; start the next"
 *
 *  Only a DAILY streak has an end-of-day. A weekly streak (the gentler mode some
 *  learners choose) is never counted down.
 *  @param {ReturnType<typeof companionContext>} c
 *  @param {{numbers?:boolean, streakAlerts?:boolean}} opts */
export function streakLine(c, { numbers = true, streakAlerts = true } = {}) {
  if (!numbers || !streakAlerts) return null;
  if (c.goalMode === 'weekly') return null;

  if (c.streakDays >= 2 && !c.doneToday) {
    return {
      kind: 'at-risk',
      text: `Your ${c.streakDays}-day streak ends in ${formatLeft(c.msLeftToday)}. One lesson or a short review keeps it going.`,
    };
  }
  if (c.streakDays === 0 && c.lastRun >= 3) {
    return {
      kind: 'ended',
      text: `Your ${c.lastRun}-day streak has ended. That happens to everyone. Today is a good day to start the next one.`,
    };
  }
  if (c.streakDays >= 2 && c.doneToday && STREAK_MILESTONES.includes(c.streakDays)) {
    return { kind: 'milestone', text: `${c.streakDays} days in a row. That is real consistency.` };
  }
  return null;
}

/** One line of encouragement for the first time Sky is opened each day. It earns
 *  nothing: it is a boost, not a reward. The same line all day, so it does not
 *  change under someone who reopens the panel.
 *  @param {string} isoDate */
export function dailyBoost(isoDate) {
  const lines = [
    'You do not have to do much today. Doing a little is the habit.',
    'Everything you already know started as something you did not.',
    'Five minutes now is worth more than an hour you keep meaning to find.',
    'Getting an answer wrong and seeing why is how it sticks.',
    'Slow is fine. Coming back is the part that matters.',
    'The people who learn most are the ones who ask the questions that seem too simple.',
    'One lesson, then see how you feel.',
  ];
  let h = 0;
  for (let i = 0; i < isoDate.length; i++) h = (h * 31 + isoDate.charCodeAt(i)) >>> 0;
  return lines[h % lines.length];
}

/** What Sky says, and the one step it suggests.
 *  @param {ReturnType<typeof companionContext>} c
 *  @param {{ numbers?: boolean, streakAlerts?: boolean }} opts */
export function companionSays(c, { numbers = true, streakAlerts = true } = {}) {
  const hello = greeting(c.now);
  const sl = streakLine(c, { numbers, streakAlerts });
  const streakTail = sl ? ` ${sl.text}` : '';
  const quietStreak = numbers && c.streakDays >= 2 && !sl
    ? ` You have learned ${plural(c.streakDays, c.goalMode === 'weekly' ? 'week' : 'day', c.goalMode === 'weekly' ? 'weeks' : 'days')} in a row.` : '';

  if (c.lessonsDone === 0) {
    const l = c.next;
    return {
      hello: 'Hi, I am Sky',
      say: l
        ? `I am your study buddy. A good place to start is "${l.t}". It takes about ${plural(l.min, 'minute', 'minutes')}.`
        : 'I am your study buddy.',
      step: l ? { label: `Start: ${l.t}`, href: `/learn/${l.s}` } : { label: 'See the roadmap', href: '/roadmap' },
      why: l ? `About ${plural(l.min, 'minute', 'minutes')}. No sign-up needed.` : '',
      streak: sl,
    };
  }

  if (sl?.kind === 'at-risk') {
    const m = c.due > 0 ? mins(Math.min(c.due, 10) * SECONDS_PER_CARD) : null;
    return {
      hello,
      say: sl.text,
      step: c.due > 0
        ? { label: `Review ${plural(Math.min(c.due, 10), 'card', 'cards')}`, href: '/review' }
        : c.next ? { label: `Continue: ${c.next.t}`, href: `/learn/${c.next.s}` } : { label: 'See the roadmap', href: '/roadmap' },
      why: c.due > 0 ? `About ${plural(m, 'minute', 'minutes')}.` : c.next ? `About ${plural(c.next.min, 'minute', 'minutes')}.` : '',
      streak: sl,
    };
  }

  if (c.quizModule) {
    return {
      hello,
      say: `You have read all of ${c.quizModuleTitle}. The module quiz is a good way to check it stuck. It has no stakes and you can retry as often as you like.${streakTail}${quietStreak}`,
      step: { label: `Quiz me on ${c.quizModuleTitle}`, href: `/quiz/${c.quizModule}` },
      why: 'Eight questions, with an explanation after each.',
      streak: sl,
    };
  }

  if (c.due > 0) {
    const m = mins(c.due * SECONDS_PER_CARD);
    return {
      hello,
      say: `${plural(c.due, 'card is', 'cards are')} ready to review. It takes about ${plural(m, 'minute', 'minutes')}. Going back over things is what makes them stay.${streakTail}${quietStreak}`,
      step: { label: `Review ${plural(c.due, 'card', 'cards')}`, href: '/review' },
      why: `About ${plural(m, 'minute', 'minutes')}.`,
      streak: sl,
    };
  }

  if (c.next) {
    return {
      hello,
      say: `Next in your path: "${c.next.t}", about ${plural(c.next.min, 'minute', 'minutes')}.${streakTail}${quietStreak}`,
      step: { label: `Continue: ${c.next.t}`, href: `/learn/${c.next.s}` },
      why: `About ${plural(c.next.min, 'minute', 'minutes')}.`,
      streak: sl,
    };
  }

  return {
    hello,
    say: 'You have finished everything that is live so far. New lessons are added over time. Reviewing old cards is a good use of any spare minutes.',
    step: { label: 'See the roadmap', href: '/roadmap' },
    why: '',
    streak: sl,
  };
}

/** The "my progress" view. Plain facts about the learner. */
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
    note: 'The board is optional and anonymous. Your numbers here are only ever shown to you.',
  };
}

/** The daily goals and milestones. All derived from real progress.
 *  @param {ReturnType<typeof companionContext>} c
 *  @param {{ quiz:boolean, cards:boolean, lesson:boolean }} today */
export function dailyGoals(c, today) {
  const goals = [
    { id: 'lesson', label: 'Finish a lesson', done: today.lesson, href: c.next ? `/learn/${c.next.s}` : '/roadmap' },
    { id: 'cards', label: 'Review your cards', done: today.cards, href: '/review' },
    { id: 'quiz', label: 'Do the 5-minute quiz', done: today.quiz, href: null },
  ];
  const milestones = [
    { id: 'streak7', label: '7 days in a row', have: Math.min(c.streakDays, 7), need: 7 },
    { id: 'lessons10', label: '10 lessons finished', have: Math.min(c.lessonsDone, 10), need: 10 },
    { id: 'level5', label: 'Reach level 5', have: Math.min(c.level, 5), need: 5 },
    { id: 'badges5', label: 'Earn 5 badges', have: Math.min(c.badgesEarned, 5), need: 5 },
  ];
  return { goals, milestones, allDone: goals.every((g) => g.done) };
}

/** True if a message breaks the tone rule. */
export function breaksToneRule(text) {
  const t = String(text);
  return FORBIDDEN_TONE.find((w) => new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(t)) ?? null;
}
