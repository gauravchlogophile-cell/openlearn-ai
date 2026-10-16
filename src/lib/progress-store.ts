/** localStorage adapter around progress-core (anonymous mode = default).
 *  Emits 'ol:progress' on any change, including settings. */
import {
  emptyState, completeLesson, totalXp, streak, weeklyStreak, level,
  earnedBadges, recordQuizPass, quizPassed,
  newCard, gradeCard, recordReviewSession, activityDate,
  recordQuickQuiz, recordBonusStar, bonusStarsToday, BONUS_STARS_PER_DAY,
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

/* ---------- read-aloud voice ----------
 * Which voice reads lessons aloud, and how fast. Stored by the voice's own URI
 * (its stable name on this device) rather than its position in a list, because
 * the list can change order between visits. null means "the best voice for the
 * page", chosen by voices.js. Saved on this device only.
 *
 * recorded: prefer a recorded human narration when the lesson has one. */
export interface SpeechPrefs { voiceURI: string | null; rate: number; recorded: boolean }
export const SPEECH_DEFAULTS: SpeechPrefs = { voiceURI: null, rate: 1, recorded: true };

export function speechPrefs(): SpeechPrefs {
  if (typeof localStorage === 'undefined') return { ...SPEECH_DEFAULTS };
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}').speech ?? {};
    const rate = Number(s.rate);
    return {
      voiceURI: typeof s.voiceURI === 'string' ? s.voiceURI : null,
      rate: Number.isFinite(rate) && rate >= 0.5 && rate <= 2 ? rate : 1,
      recorded: typeof s.recorded === 'boolean' ? s.recorded : true,
    };
  } catch { return { ...SPEECH_DEFAULTS }; }
}

export function setSpeechPref<K extends keyof SpeechPrefs>(name: K, value: SpeechPrefs[K]) {
  const raw = localStorage.getItem(SETTINGS_KEY);
  let s: Record<string, any> = {};
  try { s = raw ? JSON.parse(raw) : {}; } catch { /* reset */ }
  s.speech = { ...(s.speech ?? {}), [name]: value };
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

/* ---------- Sky companion preferences ----------
 * What Sky asks of the person looking at it, how it reacts, and where it sits.
 * Every default is the friendliest setting for someone who has never opened the
 * panel, and every one can be changed by the person it affects.
 *
 *   numbers       show streak and level talk. Off for anyone for whom a counter
 *                 is pressure rather than encouragement; it also silences streak
 *                 alerts, since they are numbers.
 *   streakAlerts  say when a streak is about to end or has ended.
 *   nudges        offer a next step when a page opens.
 *   timer         show a five-minute countdown on the quick quiz. Its end is a
 *                 prompt, never a cut-off, and turning it off removes it.
 *   small         Sky as a small round button without its label.
 *   fx            Sky's reactions: calm, gentle (default) or lively. Reduced
 *                 motion, from the device or from Lrnon, always means calm.
 *   sound         a short chime with a reaction. Off by default.
 *   pos           where the person has put Sky. null means the default corner.
 *
 * Motion itself is NOT here: it follows the reader preference `motion` and the
 * device setting, so there is one place to turn movement off, not two. */
export type SkyFx = 'calm' | 'gentle' | 'lively';
export interface SkyPrefs {
  numbers: boolean; streakAlerts: boolean; nudges: boolean; timer: boolean; small: boolean;
  fx: SkyFx; sound: boolean; pos: { x: number; y: number } | null;
}
export const SKY_PREF_DEFAULTS: SkyPrefs = {
  numbers: true, streakAlerts: true, nudges: true, timer: true, small: false,
  fx: 'gentle', sound: false, pos: null,
};

export function skyPrefs(): SkyPrefs {
  const d = SKY_PREF_DEFAULTS;
  if (typeof localStorage === 'undefined') return { ...d };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}').sky ?? {};
    const bool = (k: 'numbers' | 'streakAlerts' | 'nudges' | 'timer' | 'small' | 'sound') =>
      (typeof saved[k] === 'boolean' ? saved[k] : d[k]) as boolean;
    const pos = saved.pos && Number.isFinite(saved.pos.x) && Number.isFinite(saved.pos.y)
      ? { x: Math.min(1, Math.max(0, saved.pos.x)), y: Math.min(1, Math.max(0, saved.pos.y)) } : null;
    return {
      numbers: bool('numbers'), streakAlerts: bool('streakAlerts'), nudges: bool('nudges'),
      timer: bool('timer'), small: bool('small'), sound: bool('sound'),
      fx: saved.fx === 'calm' || saved.fx === 'gentle' || saved.fx === 'lively' ? saved.fx : d.fx,
      pos,
    };
  } catch { return { ...d }; }
}

export function setSkyPref<K extends keyof SkyPrefs>(name: K, value: SkyPrefs[K]) {
  const raw = localStorage.getItem(SETTINGS_KEY);
  let s: Record<string, any> = {};
  try { s = raw ? JSON.parse(raw) : {}; } catch { /* reset */ }
  s.sky = { ...(s.sky ?? {}), [name]: value };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent('ol:progress'));
}

/* ---------- Sky's small local store ----------
 * What is kept on this device and nowhere else: the day's practice flags, and the
 * two collectibles. Separate from the progress ledger on purpose. Points live in
 * the ledger (and sync); these are display counters, and losing them costs a
 * number on a panel and never a learner's progress.
 *
 *   stars  one for each question answered correctly in Sky's quick quiz, one for
 *          each bonus star caught.
 *   gears  one for each card marked as known in Sky's review, one for each new
 *          topic opened from Explore.
 *   boost  the day the daily boost was last shown, so it appears once a day. */
const SKY_STORE_KEY = 'ol.sky.v1';
export interface SkyStore { day: string; quiz: boolean; cards: boolean; stars: number; gears: number; boost: string; seenBadges: string[]; lastStreakAlert: string; chest: string; explored: string[] }
const todayKey = () => new Date().toISOString().slice(0, 10);

export function skyStore(): SkyStore {
  const fresh: SkyStore = { day: todayKey(), quiz: false, cards: false, stars: 0, gears: 0, boost: '', seenBadges: [], lastStreakAlert: '', chest: '', explored: [] };
  if (typeof localStorage === 'undefined') return fresh;
  try {
    const saved = JSON.parse(localStorage.getItem(SKY_STORE_KEY) ?? '{}');
    const merged = { ...fresh, ...saved };
    if (merged.day !== todayKey()) { merged.day = todayKey(); merged.quiz = false; merged.cards = false; }
    return merged;
  } catch { return fresh; }
}

export function patchSkyStore(patch: Partial<SkyStore>) {
  const next = { ...skyStore(), ...patch };
  try { localStorage.setItem(SKY_STORE_KEY, JSON.stringify(next)); } catch { /* full or blocked */ }
  window.dispatchEvent(new CustomEvent('ol:progress'));
  return next;
}

/** Bonus star: two points, three a day, not learning. The ledger does the
 *  counting and the cap; this only records the collectible. */
export function catchBonusStar(): boolean {
  const before = load();
  const after = recordBonusStar(before, crypto.randomUUID(), new Date());
  if (after === before) return false;
  save(after);
  patchSkyStore({ stars: skyStore().stars + 1 });
  return true;
}

export function bonusStarsLeft(): number {
  return Math.max(0, BONUS_STARS_PER_DAY - bonusStarsToday(load(), new Date()));
}

/** The Sky quick quiz finished: five points once a day, whatever the score. */
export function finishQuickQuiz(correct: number) {
  save(recordQuickQuiz(load(), crypto.randomUUID(), new Date()));
  patchSkyStore({ quiz: true, stars: skyStore().stars + correct });
}

/** Bump the gear counter (cards known, topics opened). */
export function addGears(n: number) { patchSkyStore({ gears: skyStore().gears + n }); }

/** The review store as it stands, for read-only use by the companion. */
export function srsSnapshot(): Record<string, any> { return srsLoad(); }

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

/* ---------------------------------------------------------------- review log
   "Your week" (design turn 7) shows review cards per day. That number is not
   recoverable from anything already stored: the event ledger carries ONE
   review_session event per day regardless of how many cards were graded, and
   an SM-2 card records only its next due date, not the days it was seen. So a
   card graded on Monday and again on Thursday would count once, on Thursday.

   Rather than under-report, keep a tiny tally of its own. It lives outside
   ol.progress.v1 deliberately: that blob is the XP ledger, it round-trips
   through mergeFromServer(), and adding a key there risks either being
   dropped by a merge or being mistaken for an XP source. This is display
   data, it never affects XP, level or streak, and losing it costs a number
   on a panel rather than a learner's progress.

   Trimmed to the last 60 days on write, so it cannot grow without bound on a
   device somebody uses for years. */
const REVIEW_LOG_KEY = 'ol.reviewlog.v1';
const REVIEW_LOG_DAYS = 60;

export function reviewLog(): Record<string, number> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(REVIEW_LOG_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

function noteCardReviewed(now: Date) {
  if (typeof localStorage === 'undefined') return;
  const day = activityDate(now);
  const log = reviewLog();
  log[day] = (log[day] ?? 0) + 1;

  const cutoff = activityDate(new Date(now.getTime() - REVIEW_LOG_DAYS * 86400000));
  // ISO dates sort lexicographically, so a string compare is a date compare.
  const trimmed = Object.fromEntries(Object.entries(log).filter(([d]) => d >= cutoff));
  try { localStorage.setItem(REVIEW_LOG_KEY, JSON.stringify(trimmed)); } catch { /* full or blocked */ }
}

export function gradeAndSave(key: string, grade: 'again' | 'hard' | 'good' | 'easy') {
  const map = srsLoad();
  const now = new Date();
  map[key] = gradeCard(map[key] ?? newCard(now), grade, now);
  srsSave(map);
  noteCardReviewed(now);
}

/** Award the daily review XP (idempotent per activity day) — also marks
 *  the streak day, since streaks derive from events. */
export function finishReviewSession() {
  save(recordReviewSession(load(), crypto.randomUUID(), new Date()));
}
