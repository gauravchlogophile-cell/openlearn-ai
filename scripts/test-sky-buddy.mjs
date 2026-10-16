#!/usr/bin/env node
/**
 * Sky the companion: the rules that keep its game-like parts in the service of
 * learning, and the limits that keep its reactions safe.
 *
 * The brief changed on 16 October 2026. The day before, Sky awarded nothing, never
 * mentioned a streak and had no board. The owner then asked for the opposite on
 * all three, and for reactions with light and sound, while keeping it usable by
 * people who are sensitive to light and movement. So this file now pins a
 * different set of lines than it did, and the lines are as firm:
 *
 *   · Sky talks about streaks, and never shames anyone
 *   · opening Sky earns no points; only learning does, and a bonus star is not
 *     learning, so it cannot keep a streak alive
 *   · the board is opt-in, and its made-up practice pals are labelled as made up
 *   · reactions are bounded: a reaction cannot flash more than twice, faster than
 *     once a second, brighter than half strength, or at all under reduce motion
 *   · everything that could pressure someone can be switched off by them
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  companionContext, companionSays, progressFacts, dueCards, breaksToneRule, streakLine, dailyBoost, dailyGoals,
  formatLeft, COMPANION_POLICY, FORBIDDEN_TONE, STREAK_MILESTONES,
} from '../src/lib/sky-buddy.js';
import { palsFor, mergeBoard, PAL_LABEL, PAL_EXPLANATION } from '../src/lib/sky-pals.js';
import { effectiveFx, cheerPlan, FX_LIMITS, CHEERS, clipKind, motionAllowed, FX_LEVELS } from '../src/lib/sky-fx.js';
import { emptyState, completeLesson, recordQuizPass, recordBonusStar, totalXp } from '../src/lib/progress-core.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
let failed = 0, passed = 0;
const check = (name, ok, extra = '') => { if (ok) { passed++; return; } failed++; console.error('FAIL', name, extra); };

// ---- a small, honest index --------------------------------------------------
const index = {
  v: 1,
  modules: { e1: 'What Is AI, Really?', e2: 'Meet Your AI Assistants' },
  quizzes: ['e1', 'e2'],
  lessons: [
    { s: 'explorer/e1/l1-a', t: 'AI in your daily life', m: 'e1', o: 1, min: 5, c: 2 },
    { s: 'explorer/e1/l2-b', t: 'A short history', m: 'e1', o: 2, min: 6, c: 2 },
    { s: 'explorer/e2/l1-c', t: 'The assistant landscape', m: 'e2', o: 1, min: 7, c: 3 },
  ],
};
const NOW = new Date('2026-10-15T10:00:00');
const day = (d, h = 9) => new Date(`2026-10-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00`);
function stateWith(slugs, when = (i) => day(10 + i)) {
  let s = emptyState();
  slugs.forEach((slug, i) => { s = completeLesson(s, slug, 'h', `id-${slug}`, when(i)); });
  return s;
}
const ctxOf = (state, srs = {}, now = NOW) => companionContext(index, state, srs, now);
const say = (state, srs, opts, now) => companionSays(ctxOf(state, srs, now), opts);
const allText = (r) => [r.hello, r.say, r.why, r.step?.label, r.streak?.text].filter(Boolean).join(' ');

// ---- scenarios --------------------------------------------------------------
const L3 = ['explorer/e1/l1-a', 'explorer/e1/l2-b', 'explorer/e2/l1-c'];
const scenarios = {
  'brand-new visitor': say(emptyState()),
  'first lesson done': say(stateWith(['explorer/e1/l1-a'])),
  'a streak at risk (3 days, nothing yet today)': say(stateWith(L3, (i) => day(12 + i, 9)), {}, undefined, day(15, 10)),
  'a streak kept today': say(stateWith(L3, (i) => day(13 + i, 9)), {}, undefined, day(15, 20)),
  'a streak that has ended': say(stateWith(L3, (i) => new Date(`2026-09-${String(1 + i).padStart(2, '0')}T09:00:00`))),
  'module finished, quiz not taken': say(stateWith(['explorer/e1/l1-a', 'explorer/e1/l2-b'], (i) => day(14 + i))),
  'numbers off': say(stateWith(L3, (i) => day(12 + i)), {}, { numbers: false }),
  'streak alerts off': say(stateWith(L3, (i) => day(12 + i)), {}, { streakAlerts: false }),
};

// 1. Nothing Sky says is shame, scolding or pressure. (Streak talk is allowed.)
for (const [name, r] of Object.entries(scenarios)) {
  const bad = breaksToneRule(allText(r));
  check(`tone: "${name}" contains no shaming or pressure`, !bad, `matched "${bad}" in: ${allText(r)}`);
}
check('tone rule catches what it should', ['You should be ashamed', 'How disappointing', 'Hurry, last chance', 'Upgrade to premium', 'Please donate', 'You failed', 'Do not give up now, lazy'].every((t) => breaksToneRule(t)));
check('tone rule lets a streak be discussed', !breaksToneRule('Your 6-day streak ends in 2 h 10 min. One lesson keeps it going.') && !breaksToneRule('Your 6-day streak has ended. That happens to everyone.'));
check('tone rule does not fire on words that merely contain a banned one', !breaksToneRule('Shameless fun at the premiumized fair.'));
check('the forbidden list is not empty', FORBIDDEN_TONE.length >= 15);

// 2. Streak talk: present when true, factual, with a way forward, and switchable off.
{
  const risk = streakLine(ctxOf(stateWith(L3, (i) => day(12 + i)), {}, day(15, 10)));
  check('a streak at risk is said plainly, with the number and the time left', risk?.kind === 'at-risk' && /3-day streak ends in/.test(risk.text) && /\d+ (h \d\d )?min/.test(risk.text), JSON.stringify(risk));
  check('and says what keeps it', /One lesson or a short review keeps it going/.test(risk?.text ?? ''));
  const ended = streakLine(ctxOf(stateWith(L3, (i) => new Date(`2026-09-${String(1 + i).padStart(2, '0')}T09:00:00`))));
  check('a streak that ended is named with its real length, and without blame', ended?.kind === 'ended' && /3-day streak has ended/.test(ended.text) && /happens to everyone/.test(ended.text), JSON.stringify(ended));
  check('a kept streak at a milestone is celebrated', STREAK_MILESTONES.includes(3) && streakLine(ctxOf(stateWith(L3, (i) => day(13 + i)), {}, day(15, 20)))?.kind === 'milestone');
  check('no streak talk when numbers are off', streakLine(ctxOf(stateWith(L3, (i) => day(12 + i)), {}, day(15, 10)), { numbers: false }) === null);
  check('no streak talk when streak alerts are off', streakLine(ctxOf(stateWith(L3, (i) => day(12 + i)), {}, day(15, 10)), { streakAlerts: false }) === null);
  check('no countdown for a weekly streak', streakLine({ ...ctxOf(stateWith(L3, (i) => day(12 + i)), {}, day(15, 10)), goalMode: 'weekly' }) === null);
  check('a streak of one day is not nagged about', streakLine(ctxOf(stateWith(['explorer/e1/l1-a'], () => day(14)), {}, day(15, 10))) === null);
  check('a first visit gets no streak talk', streakLine(ctxOf(emptyState())) === null);
  check('formatLeft reads naturally', formatLeft(5 * 3600000 + 12 * 60000) === '5 h 12 min' && formatLeft(42 * 60000) === '42 min');
}

// 3. Each message offers one concrete, correct next step.
const hrefOk = (h) => /^\/(learn\/(explorer|practitioner)\/[a-z0-9]+\/[a-z0-9-]+|review|roadmap|quiz\/[a-z0-9]+)$/.test(h);
for (const [name, r] of Object.entries(scenarios)) check(`step: "${name}" has a valid link`, r.step && hrefOk(r.step.href), JSON.stringify(r.step));
check('a new visitor is pointed at the first lesson, and told how long it takes',
  scenarios['brand-new visitor'].step.href === '/learn/explorer/e1/l1-a' && /about 5 minutes/.test(scenarios['brand-new visitor'].say));
check('a finished module suggests its quiz', scenarios['module finished, quiz not taken'].step.href === '/quiz/e1');

// 4. Due cards: counted by the review page's own rule.
{
  const done = { 'explorer/e1/l1-a': { at: 'x' }, 'explorer/e2/l1-c': { at: 'x' } };
  const srs = { 'explorer/e1/l1-a#0': { dueAt: '2026-10-14T00:00:00Z' }, 'explorer/e1/l1-a#1': { dueAt: '2026-10-20T00:00:00Z' } };
  check('due cards = overdue + never-seen, from finished lessons only', dueCards(index.lessons, done, srs, NOW) === 4);
  check('cards from unfinished lessons do not count', dueCards(index.lessons, {}, {}, NOW) === 0);
}

// 5. Progress facts, daily goals, the daily boost.
{
  const c = ctxOf(stateWith(['explorer/e1/l1-a', 'explorer/e1/l2-b'], (i) => day(14 + i)));
  const f = progressFacts(c);
  check('progress facts include lessons, streak, level, badges', f.rows.length === 4);
  check('level progress is a percentage', f.levelPercent >= 0 && f.levelPercent <= 100);
  check('progress facts say the numbers are only shown to you', /only ever shown to you/i.test(f.note));
  const g = dailyGoals(c, { lesson: true, cards: false, quiz: false });
  check('daily goals: three, with milestones', g.goals.length === 3 && g.milestones.length >= 3 && g.allDone === false);
  check('daily goals: all done is recognised', dailyGoals(c, { lesson: true, cards: true, quiz: true }).allDone === true);
  check('the daily boost is the same all day and differs across days', dailyBoost('2026-10-15') === dailyBoost('2026-10-15') && new Set(['2026-10-15', '2026-10-16', '2026-10-16', '2026-10-18', '2026-10-19']
    .map(dailyBoost)).size > 1);
  check('every boost line is free of shame and pressure', ['2026-10-15', '2026-10-16', '2026-10-16', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21'].every((d) => !breaksToneRule(dailyBoost(d))));
}

// 6. The policy, as data.
check('policy: opening Sky earns no points', COMPANION_POLICY.openingEarnsPoints === false);
check('policy: Sky cheers and talks about streaks', COMPANION_POLICY.cheers === true && COMPANION_POLICY.talksAboutStreaks === true);
check('policy: the board is opt-in and pals are labelled', COMPANION_POLICY.boardIsOptIn === true && COMPANION_POLICY.palsAreLabelled === true);
check('policy: timers are optional and everything can be switched off', COMPANION_POLICY.timersAreOptional === true && COMPANION_POLICY.everythingCanBeSwitchedOff === true);
check('policy: never asks for money', COMPANION_POLICY.asksForMoney === false);
check('policy object cannot be changed at runtime', Object.isFrozen(COMPANION_POLICY));

// 7. Bonus stars are not learning.
{
  let s = emptyState();
  for (let i = 0; i < 5; i++) s = recordBonusStar(s, `s-${i}`, day(15, 9));
  check('three bonus stars a day, two points each', totalXp(s) === 6);
  check('and they never make a streak', ctxOf(s).streakDays === 0 && ctxOf(s).doneToday === false);
  check('a quiz pass does', ctxOf(recordQuizPass(emptyState(), 'e1', 1, 'q', day(15, 9))).doneToday === true);
}

// 8. Practice pals: made up, labelled, and never mistaken for people.
{
  const a = palsFor('2026-10-15', 'today', 14), b = palsFor('2026-10-15', 'today', 14), c = palsFor('2026-10-16', 'today', 14);
  check('pals are the same for the same day and hour on every device', JSON.stringify(a) === JSON.stringify(b));
  check('pals change from one day to the next', JSON.stringify(a.map((p) => p.handle)) !== JSON.stringify(c.map((p) => p.handle)) || JSON.stringify(a.map((p) => p.points)) !== JSON.stringify(c.map((p) => p.points)));
  check('every pal is flagged and labelled', a.every((p) => p.pal === true && p.label === PAL_LABEL));
  check('no pal name can be mistaken for a generated learner handle', a.every((p) => / the [A-Z][a-z]+$/.test(p.handle) && !/^[a-z]+-[a-z]+(-\d{3})?$/.test(p.handle)));
  check('pal names are distinct within a day', new Set(a.map((p) => p.handle)).size === a.length);
  check('the explanation says plainly they are not real learners and not counted', /not real learners/.test(PAL_EXPLANATION) && /not counted/.test(PAL_EXPLANATION));
  check('scores grow through the day', palsFor('2026-10-15', 'today', 20).reduce((n, p) => n + p.points, 0) > palsFor('2026-10-15', 'today', 8).reduce((n, p) => n + p.points, 0));
  check('a week is worth more than a day', palsFor('2026-10-15', 'week', 14).reduce((n, p) => n + p.points, 0) > palsFor('2026-10-15', 'today', 14).reduce((n, p) => n + p.points, 0));
  check('streaks are plausible', a.every((p) => p.streak >= 1 && p.streak <= 28));
  const real = [{ handle: 'quiet-fern', level: 4, points: 999, streak: 5, is_me: true, rank: 1 }, { handle: 'amber-lane', level: 2, points: 3, streak: 1, is_me: false, rank: 2 }];
  const merged = mergeBoard(real, a, 10);
  check('a real learner who is ahead stays ahead', merged[0].handle === 'quiet-fern' && merged[0].rank === 1);
  check('pals are ranked alongside real learners and ranks are consecutive', merged.every((r, i) => r.rank === i + 1) && merged.length === 8);
  check('pals never push a real learner off a full board', mergeBoard(Array.from({ length: 10 }, (_, i) => ({ handle: `r-${i}`, points: 1, level: 1, streak: 0, is_me: false })), a, 10).every((r) => !r.pal));
  check('pals fill space but only the space that is left', mergeBoard(real, a, 4).filter((r) => r.pal).length === 2);
  check('with nobody on the board, the board is still not empty', mergeBoard([], a, 10).length === a.length);
}

// 9. Reactions: bounded, and calm under reduce motion.
{
  check('three reaction levels', JSON.stringify(FX_LEVELS) === JSON.stringify(['calm', 'gentle', 'lively']));
  check('reduce motion forces calm, whatever was chosen', effectiveFx('lively', { reduceMotion: true }) === 'calm' && effectiveFx('gentle', { reduceMotion: true }) === 'calm');
  check('otherwise the choice stands, and the default is gentle', effectiveFx('lively', { reduceMotion: false }) === 'lively' && effectiveFx(undefined, { reduceMotion: false }) === 'gentle' && effectiveFx('junk', { reduceMotion: false }) === 'gentle');
  const kinds = ['lesson', 'level', 'badge', 'streak', 'cards', 'quiz', 'star'];
  check('calm: nothing lights up and nothing flashes', kinds.every((k) => { const p = cheerPlan(k, 'calm', false); return !p.glow && p.flashes === 0; }));
  check('gentle: a glow and never a flash', kinds.every((k) => { const p = cheerPlan(k, 'gentle', false); return p.glow && p.flashes === 0; }));
  check('lively: at most two flashes in a reaction', kinds.every((k) => cheerPlan(k, 'lively', false).flashes <= 2));
  check('a small win flashes once and a big one twice', cheerPlan('lesson', 'lively', false).flashes === 1 && cheerPlan('level', 'lively', false).flashes === 2);
  check('a chime plays only if sound is on', cheerPlan('lesson', 'lively', false).chime === false && cheerPlan('lesson', 'gentle', true).chime === true);
  check('the hard limits are what the safety rule says', FX_LIMITS.flashesPerCheer <= 2 && FX_LIMITS.flashMs >= 1000 && FX_LIMITS.maxFlashOpacity <= 0.5 && FX_LIMITS.chimeMs <= 1500 && FX_LIMITS.chimeVolume <= 0.25);
  check('three flashes a second is impossible at these limits', 1000 / FX_LIMITS.flashMs < 3 && FX_LIMITS.flashesPerCheer / (FX_LIMITS.flashMs / 1000 * FX_LIMITS.flashesPerCheer) < 3);
  check('every cheer is calm: no exclamation marks, no shame', Object.values(CHEERS).flat().every((t) => !/!/.test(t) && !breaksToneRule(t)));
  check('motion is refused by the page setting', motionAllowed({ getAttribute: (k) => (k === 'data-motion' ? 'reduce' : null) }, () => ({ matches: false })) === false);
  check('motion is refused by the device', motionAllowed({ getAttribute: () => null }, () => ({ matches: true })) === false);
  check('motion is allowed when neither objects', motionAllowed({ getAttribute: () => null }, () => ({ matches: false })) === true);
  const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
  const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1';
  const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
  const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';
  check('Safari and every iPhone browser get the animated WebP', clipKind(SAFARI) === 'webp' && clipKind(IPHONE_CHROME) === 'webp');
  check('Chrome and Firefox get the WebM', clipKind(CHROME) === 'webm' && clipKind(FIREFOX) === 'webm');
  check('an unknown browser gets the safer file', clipKind('SomeNewBrowser/1.0') === 'webp');
}

// 10. The stylesheet: every number in the safety rule, checked where it lives.
{
  const css = readFileSync(join(ROOT, 'src/styles/sky.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const anims = [...css.matchAll(/animation:\s*([^;]+);/g)].map((m) => m[1].trim());
  const parse = (a) => ({ name: a.match(/skyb-[\w-]+/)?.[0], secs: Number((a.match(/([\d.]+)s/) ?? [])[1] ?? 0), infinite: /infinite/.test(a), count: Number((a.match(/\s(\d+)\s*$/) ?? [])[1] ?? 1) });
  for (const a of anims) {
    const p = parse(a);
    if (p.infinite) check(`an endless animation is slow: ${p.name} (${p.secs}s)`, p.secs >= 5, a);
    else {
      check(`a one-off reaction lasts over a second: ${p.name} (${p.secs}s)`, p.secs >= 1, a);
      check(`and runs at most twice: ${p.name}`, p.count <= 2, a);
    }
  }
  const frames = Object.fromEntries([...css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\}\s*\}/g)].map((m) => [m[1], m[2]]));
  const flash = frames['skyb-flash'] ?? '';
  const peaks = [...flash.matchAll(/opacity:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  check('the flash never exceeds half strength', peaks.length > 0 && Math.max(...peaks) <= FX_LIMITS.maxFlashOpacity, flash);
  check('the flash is not a rapid on-off: it fades in and out', peaks.length >= 3);
  for (const [name, body] of Object.entries(frames)) {
    if (name === 'skyb-glow') check('the glow only grows and shrinks a soft ring (box-shadow), nothing else', /box-shadow/.test(body) && !/opacity|filter|background|color/.test(body.replace(/var\(--[\w-]+\)|rgba\([^)]*\)/g, '')));
    else if (name === 'skyb-flash') continue;
    else check(`${name} only moves things`, /translate/.test(body) && !/opacity|color|background|filter|box-shadow|brightness/i.test(body));
  }
  check('the flash is the sky tint, never red', /skyb-flash/.test(css) && !/#f00|#ff0000|red\b|rgb\(\s*255\s*,\s*0/i.test(css));
  check('the flash is limited to a small button, not the page', /\.skyb-fab\.is-flashing::after[\s\S]*?inset:\s*0/.test(css) && !/position:\s*fixed[^}]*flash/.test(css));
  check('a flash only runs at the lively level', /\.skyb\[data-fx="lively"\] \.skyb-fab\.is-flashing/.test(css) && !/\.skyb\[data-fx="gentle"\][^{]*is-flashing/.test(css));
  check('the glow does not run at calm', !/data-fx="calm"[^{]*animation/.test(css));
  check('no neon: no text-shadow, drop-shadow glow, blur or hue shifts', !/text-shadow|drop-shadow|blur\(|hue-rotate|saturate\(/.test(css));
  check('tokens.css switches off every animation under reduce motion',
    /data-motion="reduce"\] \*,/.test(readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8')));
}

// 11. The code: what the shell may and may not do.
const files = {
  brain: 'src/lib/sky-buddy.js', fx: 'src/lib/sky-fx.js', pals: 'src/lib/sky-pals.js',
  shell: 'src/components/SkyBuddy.tsx', views: 'src/components/sky/SkyViews.tsx', stage: 'src/components/sky/SkyStage.tsx',
  hero: 'src/components/SkyHero.tsx',
};
const src = Object.fromEntries(Object.entries(files).map(([k, f]) => [k, readFileSync(join(ROOT, f), 'utf8')]));
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
{
  const AWARDS = ['markComplete', 'finishReviewSession', 'passQuiz', 'recordQuizAttempt', 'gradeAndSave', 'completeLesson', 'recordReviewSession', 'recordQuizPass', 'mergeFromServer', 'finishQuickQuiz', 'catchBonusStar', 'recordBonusStar', 'recordQuickQuiz'];
  for (const k of ['brain', 'fx', 'pals', 'shell']) {
    for (const fn of AWARDS) check(`${files[k]} never calls ${fn}: opening or reading Sky earns nothing`, !new RegExp(`\\b${fn}\\b`).test(code(src[k])));
  }
  // The only places that may award points: the practice views (for the five things Sky hosts) and the hero's bonus stars.
  check('the quick quiz awards through finishQuickQuiz, once a day', /finishQuickQuiz\(/.test(code(src.views)));
  check('the cards award through the review functions, as /review does', /gradeAndSave\(/.test(code(src.views)) && /finishReviewSession\(/.test(code(src.views)));
  check('bonus stars are awarded only from the hero, through catchBonusStar', /catchBonusStar\(/.test(code(src.hero)) && !/catchBonusStar/.test(code(src.views)) && !/catchBonusStar/.test(code(src.shell)));
  check('the shell sets no timers or intervals: only the quiz clock may', !/\b(setInterval|requestAnimationFrame)\b/.test(code(src.shell)) && /setInterval/.test(code(src.views)));
  check('the quiz clock is behind the timer setting and never ends the quiz', /prefs\.timer/.test(code(src.views)) && /pace guide/.test(src.views) && !/setDone\(true\)[^;]*left\s*[<=]/.test(code(src.views)));
  check('nothing asks for money', ['brain', 'fx', 'pals', 'shell', 'views', 'stage', 'hero'].every((k) => !/\b(donate|donation|support lrnon|₹|\$\d)/i.test(code(src[k]).replace(/export const FORBIDDEN_TONE = \[[\s\S]*?\];/, ''))));
  check('the board reads only the opt-in board and the profile flag', /sky_board/.test(code(src.views)) && /set_leaderboard_opt_in/.test(code(src.views)) && !/from\('profiles'\)\.select\('(?!leaderboard_opt_in)/.test(code(src.views)));
  check('the board labels pals and explains them', /PAL_LABEL/.test(code(src.views)) && /PAL_EXPLANATION/.test(code(src.views)));
  check('joining the board asks under-18s to check with a parent or guardian', /parent or guardian/.test(src.views));
  const fetches = [...code(src.shell + src.views + src.stage + src.hero).matchAll(/fetch\(\s*([^,)]+)/g)].map((m) => m[1].trim());
  check('the companion fetches only the index, the practice files and the assistant route', fetches.every((f) => /\/api\/sky|`\/buddy|'\/buddy|url/.test(f)), fetches.join(' | '));
  check('no analytics or tracking in Sky', !/analytics|gtag|plausible|posthog|segment/i.test(code(src.shell + src.views + src.stage + src.hero)));
  /* Sound, as of 16 October 2026: on by default, quiet, one switch from off, and made only by the
     one synthesiser (sky-fx.js) and the one voice module (sky-voice.js), never by a stray audio tag. */
  const store = readFileSync(join(ROOT, 'src/lib/progress-store.ts'), 'utf8');
  check('sound and voice are on by default, and either can be switched off', /sound: true, voice: true/.test(store) && /Sky sound is on\. Turn it off/.test(src.shell) && /'voice', 'Sky speaks'/.test(src.shell));
  check('audio comes only from the synthesiser and the voice module', !/<audio|new Audio/.test(src.shell + src.views + src.stage + src.hero));
  check('the browser is unlocked for sound on the first touch, not at the moment of the cheer', /unlockAudio\(\)/.test(src.shell) && /touchend/.test(readFileSync(join(ROOT, 'src/lib/sky-fx.js'), 'utf8')));
  check('Sky never talks over a lesson being read aloud', /synth\.speaking && !opts\.force\) return false/.test(readFileSync(join(ROOT, 'src/lib/sky-voice.js'), 'utf8')));
  check('Sky can be moved without dragging: keyboard and corner buttons', /shiftKey/.test(readFileSync(join(ROOT, 'src/components/sky/useDrag.ts'), 'utf8')) && /toCorner/.test(code(src.shell)));
  check('the welcome clip is not downloaded until asked for', /preload="none"/.test(src.stage) && !/<video[^>]*\ssrc=/.test(src.stage));
  check('the welcome clip can always be stopped, with words', /Stop the animation/.test(src.hero) && /stop/.test(src.stage));
  check('the welcome clip respects reduce motion and data-saver', /motionAllowed/.test(src.stage) && /data-saver/.test(src.stage));
  check('the welcome plays once a session, not on every visit', /skyb\.welcomed/.test(src.stage));
  check('Safari and iPhone get a clip that plays', /clipKind/.test(src.stage) && /sky-intro\.webp/.test(src.stage) && /sky-intro\.webm/.test(src.stage));
}

if (failed) { console.error(`${failed} check(s) failed, ${passed} passed`); process.exit(1); }
console.log(`sky-buddy: ${passed} checks passed`);
