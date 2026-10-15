#!/usr/bin/env node
/**
 * Sky the companion: the rules that keep its game-like parts in the service of
 * learning.
 *
 * The brief for the companion was that its mechanics exist for learning and not
 * to keep people on the site. "Not to keep people on the site" is the kind of
 * principle that holds until a metric is behind it, so it is pinned here: what
 * Sky says is checked for guilt and urgency, and the code is checked for the
 * things that would turn a study buddy into an engagement loop.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  companionContext, companionSays, progressFacts, dueCards, breaksToneRule,
  COMPANION_POLICY, FORBIDDEN_TONE,
} from '../src/lib/sky-buddy.js';
import { emptyState, completeLesson, recordQuizPass, recordReviewSession } from '../src/lib/progress-core.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
let failed = 0, passed = 0;
const check = (name, ok, extra = '') => {
  if (ok) { passed++; return; }
  failed++; console.error('FAIL', name, extra);
};

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
const day = (d) => new Date(`2026-10-${String(d).padStart(2, '0')}T09:00:00`);

function stateWith(slugs, when = (i) => day(10 + i)) {
  let s = emptyState();
  slugs.forEach((slug, i) => { s = completeLesson(s, slug, 'h', `id-${slug}`, when(i)); });
  return s;
}
const say = (state, srs = {}, opts) => companionSays(companionContext(index, state, srs, NOW), opts);
const allText = (r) => [r.hello, r.say, r.why, r.step?.label].filter(Boolean).join(' ');

// ---- scenarios --------------------------------------------------------------
const scenarios = {
  'brand-new visitor': say(emptyState()),
  'first lesson done, next is waiting': say(stateWith(['explorer/e1/l1-a'])),
  'cards due': say(stateWith(['explorer/e1/l1-a'], () => day(14)), {}),
  'module finished, quiz not taken': say(stateWith(['explorer/e1/l1-a', 'explorer/e1/l2-b'], (i) => day(14 + i))),
  'everything finished': (() => {
    let s = stateWith(['explorer/e1/l1-a', 'explorer/e1/l2-b', 'explorer/e2/l1-c'], (i) => day(13 + i));
    s = recordQuizPass(s, 'e1', 1, 'q1', day(15)); s = recordQuizPass(s, 'e2', 1, 'q2', day(15));
    const srs = {};
    for (const l of index.lessons) for (let i = 0; i < l.c; i++) srs[`${l.s}#${i}`] = { dueAt: '2027-01-01T00:00:00Z' };
    return say(s, srs);
  })(),
  'returned after a long gap (streak is zero)': say(stateWith(['explorer/e1/l1-a'], () => new Date('2026-08-01T09:00:00'))),
  'seven days in a row': say(stateWith(['explorer/e1/l1-a', 'explorer/e1/l2-b', 'explorer/e2/l1-c'], (i) => day(9 + i * 3)), {}),
  'numbers switched off': say(stateWith(['explorer/e1/l1-a'], () => day(14)), {}, { numbers: false }),
};

// 1. Nothing Sky says is guilt or urgency.
for (const [name, r] of Object.entries(scenarios)) {
  const bad = breaksToneRule(allText(r));
  check(`tone: "${name}" contains no guilt or urgency`, !bad, `matched "${bad}" in: ${allText(r)}`);
}
check('tone rule catches what it should', ['You will lose your streak', "Don't miss today", 'Hurry, this expires', 'Upgrade to premium', 'Please donate']
  .every((t) => breaksToneRule(t)));
check('tone rule does not fire on words that merely contain a banned one', !breaksToneRule('She enjoyed the mission and the breakfast.'));
check('the forbidden list is not empty', FORBIDDEN_TONE.length >= 20);

// 2. Streaks are never talked about when there isn't one, or when the learner turned numbers off.
check('no streak talk at a zero streak', !/in a row/.test(scenarios['returned after a long gap (streak is zero)'].say));
check('no streak talk when numbers are off', !/in a row|streak|level|XP/i.test(allText(scenarios['numbers switched off'])));
check('a real two-day streak is mentioned plainly',
  /\b2 days in a row/.test(say(stateWith(['explorer/e1/l1-a', 'explorer/e1/l2-b'], (i) => day(13 + i)), {}).say));

// 3. Each message offers one concrete, correct next step.
const hrefOk = (h) => /^\/(learn\/(explorer|practitioner)\/[a-z0-9]+\/[a-z0-9-]+|review|roadmap|quiz\/[a-z0-9]+)$/.test(h);
for (const [name, r] of Object.entries(scenarios)) {
  check(`step: "${name}" has a valid link`, r.step && hrefOk(r.step.href), JSON.stringify(r.step));
}
check('a new visitor is pointed at the first lesson, and told how long it takes',
  scenarios['brand-new visitor'].step.href === '/learn/explorer/e1/l1-a' && /about 5 minutes/.test(scenarios['brand-new visitor'].say));
check('a finished module suggests its quiz', scenarios['module finished, quiz not taken'].step.href === '/quiz/e1');
check('everything finished points at the roadmap', scenarios['everything finished'].step.href === '/roadmap');

// 4. Due cards: counted by the review page's own rule.
{
  const done = { 'explorer/e1/l1-a': { at: 'x' }, 'explorer/e2/l1-c': { at: 'x' } };
  const srs = {
    'explorer/e1/l1-a#0': { dueAt: '2026-10-14T00:00:00Z' },     // overdue
    'explorer/e1/l1-a#1': { dueAt: '2026-10-20T00:00:00Z' },     // not yet
    // e2 card 0, 1, 2 have never been seen: new, so they count
  };
  check('due cards = overdue + never-seen, from finished lessons only', dueCards(index.lessons, done, srs, NOW) === 1 + 3);
  check('cards from unfinished lessons do not count', dueCards(index.lessons, {}, {}, NOW) === 0);
}

// 5. Facts about the learner, and no ranking.
{
  const c = companionContext(index, stateWith(['explorer/e1/l1-a', 'explorer/e1/l2-b'], (i) => day(14 + i)), {}, NOW);
  const f = progressFacts(c);
  check('progress facts include lessons, streak, level, badges', f.rows.length === 4);
  check('level progress is a percentage', f.levelPercent >= 0 && f.levelPercent <= 100);
  check('progress view says plainly that nobody is ranked', /not rank|does not rank/i.test(f.note));
  check('progress view names the next badge, if any', f.nextBadge === null || (f.nextBadge.name && f.nextBadge.desc));
  check('level maths agrees with progress-core (level 1 starts at 0 XP)', progressFacts(companionContext(index, emptyState(), {}, NOW)).rows[2].v.startsWith('1 '));
}

// 6. The declared policy.
check('policy: awards nothing', COMPANION_POLICY.awardsProgress === false);
check('policy: compares no one', COMPANION_POLICY.comparesLearners === false);
check('policy: never asks for money', COMPANION_POLICY.asksForMoney === false);
check('policy: no timers', COMPANION_POLICY.usesTimers === false);
check('policy: sends no data anywhere', COMPANION_POLICY.sendsDataAnywhere === false);
check('policy object cannot be changed at runtime', Object.isFrozen(COMPANION_POLICY));

// 7. The code itself — what the component and its brain are forbidden to do.
const src = {
  brain: readFileSync(join(ROOT, 'src/lib/sky-buddy.js'), 'utf8'),
  ui: readFileSync(join(ROOT, 'src/components/SkyBuddy.tsx'), 'utf8'),
};
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');   // comments are explanation, not behaviour
const AWARDS = ['markComplete', 'finishReviewSession', 'passQuiz', 'recordQuizAttempt', 'gradeAndSave',
  'completeLesson', 'recordReviewSession', 'recordQuizPass', 'mergeFromServer'];
for (const [file, text] of Object.entries(src)) {
  for (const fn of AWARDS) {
    check(`${file} never calls ${fn} (it shows progress, it does not award it)`, !new RegExp(`\\b${fn}\\b`).test(code(text)));
  }
  check(`${file} sets no timers or countdowns`, !/\b(setInterval|requestAnimationFrame)\b/.test(code(text)));
  check(`${file} has no leaderboard`, !/leaderboard|ranking|top learners/i.test(code(text)));
  /* The list of words Sky must never say necessarily contains "donate". */
  const spoken = code(text).replace(/export const FORBIDDEN_TONE = \[[\s\S]*?\];/, '');
  check(`${file} does not ask for money`, !/\b(donate|donation|support lrnon|₹|\$\d)/i.test(spoken));
}
{
  const fetches = [...code(src.ui).matchAll(/fetch\(\s*([^,)]+)/g)].map((m) => m[1].trim());
  check('the component fetches only the lesson index and the assistant route',
    fetches.every((f) => /buddy-index\.json|\/api\/sky/.test(f)), fetches.join(' | '));
  check('the component imports no analytics or tracking', !/analytics|gtag|plausible|posthog|segment/i.test(code(src.ui)));
}

/* 8. Motion and light. For someone with photosensitivity or a vestibular
   condition, "it is only a small animation" is exactly the thing that is not
   acceptable to leave to taste. WCAG 2.3.1 allows at most three flashes a
   second; Sky aims far lower, at none at all. */
{
  const css = readFileSync(join(ROOT, 'src/styles/sky.css'), 'utf8');
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const anims = [...stripped.matchAll(/animation:\s*([^;]+);/g)].map((m) => m[1]);
  check('Sky has at most one animation', anims.length <= 1, anims.join(' | '));
  for (const a of anims) {
    const secs = Number(a.match(/([\d.]+)s/)?.[1] ?? 0);
    check(`every animation is slow (at least 4 seconds a cycle): "${a}"`, secs >= 4);
  }
  const frames = [...stripped.matchAll(/@keyframes\s+[\w-]+\s*\{([\s\S]*?)\}\s*\}/g)].map((m) => m[1]);
  check('Sky has at most one set of keyframes', frames.length <= 1);
  for (const f of frames) {
    check('keyframes move things; they never change opacity, colour, brightness or shadow',
      !/opacity|color|background|filter|box-shadow|brightness/i.test(f));
  }
  check('the animation is a float, not a blink or pulse', frames.every((f) => /translate/.test(f)));
  check('nothing in Sky plays sound', !/new Audio|AudioContext|\.play\(\)\s*;\s*\/\/\s*sound/.test(code(src.ui)) && !/<audio/i.test(src.ui));
  check('the optional wave clip is not downloaded until asked for', /preload="none"/.test(src.ui) && !/<video[^>]*\ssrc=/.test(src.ui));
  check('the wave clip respects reduced motion, data-saver and unsupported browsers',
    /data-motion/.test(src.ui) && /data-saver/.test(src.ui) && /prefers-reduced-motion/.test(src.ui) && /Safari/.test(src.ui));
  check('the glow is gone: no neon shadows, text-shadows or blur filters',
    !/text-shadow|drop-shadow|blur\(|hue-rotate|saturate\(/.test(stripped));
  check('tokens.css still switches off every animation under reduce motion',
    /data-motion="reduce"\] \*,/.test(readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8')));
}

if (failed) { console.error(`${failed} check(s) failed, ${passed} passed`); process.exit(1); }
console.log(`sky-buddy: ${passed} checks passed`);
