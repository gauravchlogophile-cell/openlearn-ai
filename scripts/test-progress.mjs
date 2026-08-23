#!/usr/bin/env node
/** Node tests for the pure progress core (plain ESM — direct import). */
import assert from 'node:assert/strict';
import {
  emptyState, completeLesson, totalXp, streak, weeklyStreak,
  level, activityDate, isoWeek, earnedBadges,
} from '../src/lib/progress-core.js';

// --- idempotency & XP ---
let s = emptyState();
s = completeLesson(s, 'explorer/e1/l1', 'abc', 'evt-1', new Date('2026-07-07T10:00:00'));
s = completeLesson(s, 'explorer/e1/l1', 'abc', 'evt-2', new Date('2026-07-07T11:00:00'));
assert.equal(totalXp(s), 10, 'repeat completion must not double-award');
s = completeLesson(s, 'explorer/e1/l2', 'def', 'evt-1', new Date('2026-07-07T12:00:00'));
assert.equal(totalXp(s), 10, 'duplicate event id must no-op');
s = completeLesson(s, 'explorer/e1/l2', 'def', 'evt-3', new Date('2026-07-08T09:00:00'));
assert.equal(totalXp(s), 20);

// --- daily streak & cutoff ---
assert.equal(streak(s, new Date('2026-07-08T12:00:00')), 2);
assert.equal(activityDate(new Date('2026-07-08T02:00:00')), '2026-07-07', '4am cutoff');
assert.equal(streak(s, new Date('2026-07-10T12:00:00')), 0, 'gap breaks streak');

// --- ISO weeks & weekly streak ---
assert.equal(isoWeek(new Date('2026-01-01T12:00:00')), '2026-W01');
assert.equal(isoWeek(new Date('2026-07-07T12:00:00')), '2026-W28');
let w = emptyState();
w = completeLesson(w, 'a', 'h', 'w1', new Date('2026-06-23T12:00:00')); // W26
w = completeLesson(w, 'b', 'h', 'w2', new Date('2026-06-30T12:00:00')); // W27
w = completeLesson(w, 'c', 'h', 'w3', new Date('2026-07-07T12:00:00')); // W28
assert.equal(weeklyStreak(w, new Date('2026-07-09T12:00:00')), 3, 'three consecutive weeks');
assert.equal(weeklyStreak(w, new Date('2026-07-15T12:00:00')), 3, 'grace: counted through following week');
assert.equal(weeklyStreak(w, new Date('2026-07-29T12:00:00')), 0, 'two silent weeks breaks it');

// --- level curve mirrors SQL ---
assert.equal(level(0), 1); assert.equal(level(100), 3); assert.equal(level(2500), 11);

// --- badges ---
const totals = { e1: 2, e2: 5 };
let ids = earnedBadges(s, new Date('2026-07-08T12:00:00'), totals);
assert.ok(ids.includes('first-steps'));
assert.ok(ids.includes('foundation-laid'), 'e1 complete with totals=2');
assert.ok(ids.includes('back-tomorrow'), '2-day streak badge');
assert.ok(!ids.includes('getting-into-it'), 'only 2 lessons');
assert.ok(!ids.includes('tool-scout'), 'e2 not complete');
// early bird / night owl from event local hours
let t = emptyState();
t = completeLesson(t, 'x', 'h', 'tb1', new Date('2026-07-07T06:30:00'));
t = completeLesson(t, 'y', 'h', 'tb2', new Date('2026-07-07T23:10:00'));
ids = earnedBadges(t, new Date('2026-07-07T23:30:00'), totals);
assert.ok(ids.includes('early-bird') && ids.includes('night-owl'));

console.log('progress-core: all assertions passed ✓ (' + 20 + ' checks)');

// --- module quiz pass mechanics (Sprint 6) ---
import { recordQuizPass, quizPassed, XP_MODULE_QUIZ } from '../src/lib/progress-core.js';
let q = emptyState();
q = completeLesson(q, 'explorer/e1/l1', 'h', 'q-e1', new Date('2026-07-07T10:00:00'));
q = recordQuizPass(q, 'e1', 0.875, 'qz-1', new Date('2026-07-07T10:30:00'));
assert.equal(totalXp(q), 10 + XP_MODULE_QUIZ, 'quiz pass awards module XP');
assert.ok(quizPassed(q, 'e1'));
q = recordQuizPass(q, 'e1', 1.0, 'qz-2', new Date('2026-07-07T11:00:00'));
assert.equal(totalXp(q), 10 + XP_MODULE_QUIZ, 'second pass of same module awards nothing');
q = recordQuizPass(q, 'e2', 0.9, 'qz-1', new Date('2026-07-07T11:30:00'));
assert.ok(!quizPassed(q, 'e2'), 'duplicate event id no-ops even across modules');
const bids = earnedBadges(q, new Date('2026-07-07T12:00:00'), { e1: 1 });
assert.ok(bids.includes('proven-foundation'), 'quiz-pass badge');
assert.ok(!bids.includes('proven-scout'));
console.log('quiz mechanics: all assertions passed ✓');

// --- SM-2 scheduler (Sprint 7) ---
import { newCard, gradeCard, previewIntervals, recordReviewSession, XP_REVIEW_SESSION } from '../src/lib/progress-core.js';
const t0 = new Date('2026-07-07T10:00:00');
let card = newCard(t0);
assert.equal(card.ease, 2.5); assert.equal(card.reps, 0);

// good, good, good → 1d, 6d, 15d (6 × 2.5)
card = gradeCard(card, 'good', t0);
assert.equal(card.intervalDays, 1, 'first good = 1d');
card = gradeCard(card, 'good', new Date('2026-07-08T10:00:00'));
assert.equal(card.intervalDays, 6, 'second good = 6d');
card = gradeCard(card, 'good', new Date('2026-07-14T10:00:00'));
assert.equal(card.intervalDays, 15, 'third good = 6 × ease(2.5) = 15d');

// again → lapse, 1d, ease floor respected over repeats
let lapser = newCard(t0);
for (let i = 0; i < 10; i++) lapser = gradeCard(lapser, 'again', t0);
assert.equal(lapser.ease, 1.3, 'ease floors at 1.3');
assert.equal(lapser.lapses, 10);
assert.equal(lapser.intervalDays, 1);

// easy grows ease to cap
let easy = newCard(t0);
for (let i = 0; i < 15; i++) easy = gradeCard(easy, 'easy', t0);
assert.equal(easy.ease, 3.0, 'ease caps at 3.0');
assert.ok(easy.intervalDays >= 4);

// hard: min 1d, gentle multiplier
let hard = gradeCard(newCard(t0), 'hard', t0);
assert.equal(hard.intervalDays, 1, 'hard on new card = 1d min');

// preview labels sane
const p = previewIntervals(gradeCard(gradeCard(newCard(t0), 'good', t0), 'good', t0), t0);
assert.equal(p.good, '15d');
assert.equal(p.again, '1d');

// review session XP: once per activity day, both idempotency paths
let rs = emptyState();
rs = recordReviewSession(rs, 'rv-1', new Date('2026-07-07T09:00:00'));
rs = recordReviewSession(rs, 'rv-2', new Date('2026-07-07T21:00:00'));
assert.equal(totalXp(rs), XP_REVIEW_SESSION, 'one review award per day');
rs = recordReviewSession(rs, 'rv-1', new Date('2026-07-08T09:00:00'));
assert.equal(totalXp(rs), XP_REVIEW_SESSION, 'duplicate event id no-ops');
rs = recordReviewSession(rs, 'rv-3', new Date('2026-07-08T09:00:00'));
assert.equal(totalXp(rs), XP_REVIEW_SESSION * 2, 'next day awards again');
assert.equal(streak(rs, new Date('2026-07-08T12:00:00')), 2, 'review sessions feed the streak');
const rbadges = earnedBadges(rs, new Date('2026-07-08T12:00:00'), {});
assert.ok(rbadges.includes('reviewer'));
assert.ok(!rbadges.includes('memory-keeper'));
console.log('SM-2 + review: all assertions passed ✓');

// --- option shuffling (guards against answer-position bias) ---
import { shuffleOptions, drawAndShuffle } from '../src/lib/shuffle.js';
import { readFileSync as _rf, readdirSync as _rd } from 'node:fs';

{
  // The correct option must survive the shuffle: same text, new index.
  for (let t = 0; t < 500; t++) {
    const opts = ['alpha', 'bravo', 'charlie', 'delta'];
    const answer = t % opts.length;
    const s = shuffleOptions(opts, answer);
    assert.equal(s.options.length, opts.length, 'no options lost');
    assert.deepEqual([...s.options].sort(), [...opts].sort(), 'same options, reordered');
    assert.equal(s.options[s.answer], opts[answer], 'answer index still points at the correct option');
  }

  // Positions must actually vary — a no-op shuffle would pass the checks above.
  const seen = new Set();
  for (let t = 0; t < 300; t++) seen.add(shuffleOptions(['a', 'b', 'c'], 1).answer);
  assert.equal(seen.size, 3, 'correct answer reaches every position across draws');

  // The draw must not lose the answer either.
  const items = Array.from({ length: 10 }, (_, i) => ({
    id: 'i' + i, q: 'q', options: ['x', 'y', 'z'], answer: 1, explain: 'e',
  }));
  const drawn = drawAndShuffle(items, 5);
  assert.equal(drawn.length, 5, 'draw respects count');
  assert.equal(new Set(drawn.map((d) => d.id)).size, 5, 'draw has no duplicates');
  for (const d of drawn) assert.equal(d.options[d.answer], 'y', 'drawn item keeps its correct option');

  // Authored banks are position-biased on purpose-ish (94% at index 1 when this
  // was written). That is tolerable ONLY because display order is randomised.
  // This asserts the shuffle neutralises it: over many draws of a maximally
  // biased bank, the correct answer should land in each slot roughly evenly.
  const biased = Array.from({ length: 30 }, (_, i) => ({
    id: 'b' + i, q: 'q', options: ['p', 'q', 'r'], answer: 1, explain: 'e',
  }));
  const hist = [0, 0, 0];
  for (let t = 0; t < 400; t++) for (const d of drawAndShuffle(biased, 8)) hist[d.answer]++;
  const total = hist.reduce((a, b) => a + b, 0);
  for (const h of hist) {
    const share = h / total;
    assert.ok(share > 0.28 && share < 0.39,
      `shuffled answer positions should be ~1/3 each, got ${(share * 100).toFixed(1)}%`);
  }

  // Explanations must never reference an option's position, since it moves.
  for (const f of _rd('content/quizzes')) {
    const bank = JSON.parse(_rf('content/quizzes/' + f, 'utf8'));
    for (const it of bank.items)
      assert.ok(!/\b(option|answer)\s+(a|b|c)\b|\bthe (first|second|third|middle|last) (option|choice)\b/i.test(it.explain),
        `${bank.module}:${it.id} explanation refers to an option position, which shuffling invalidates`);
  }
}
console.log('option shuffling: all assertions passed ✓');

// --- reader preferences: the pre-paint script must match progress-store ---
{
  // Base.astro applies preferences before first paint, so it cannot import
  // progress-store and duplicates the mapping instead. If the two drift, saved
  // preferences silently stop applying on load — which looks like "the theme
  // toggle forgets", and is miserable to debug. Assert they agree.
  const base = _rf('src/layouts/Base.astro', 'utf8');

  const inlineDefaults = base.match(/var D = \{([\s\S]*?)\};/);
  const inlineAttrs = base.match(/var A = \{([\s\S]*?)\};/);
  assert.ok(inlineDefaults && inlineAttrs, 'Base.astro still contains the pre-paint preference maps');

  const parsePairs = (s) => Object.fromEntries(
    [...s.matchAll(/([a-z]+)\s*:\s*'([^']+)'/g)].map((m) => [m[1], m[2]])
  );
  const D = parsePairs(inlineDefaults[1]);
  const A = parsePairs(inlineAttrs[1]);

  const store = _rf('src/lib/progress-store.ts', 'utf8');
  const specBlock = store.match(/export const READER_PREFS = \{([\s\S]*?)\n\} as const;/);
  assert.ok(specBlock, 'progress-store still exports READER_PREFS');
  const spec = {};
  for (const m of specBlock[1].matchAll(/([a-z]+):\s*\{\s*attr:\s*'([^']+)',\s*values:\s*\[([^\]]+)\]/g)) {
    spec[m[1]] = { attr: m[2], first: m[3].split(',')[0].trim().replace(/'/g, '') };
  }

  assert.deepEqual(Object.keys(D).sort(), Object.keys(spec).sort(),
    'pre-paint script covers exactly the preferences progress-store defines');
  for (const k of Object.keys(spec)) {
    assert.equal(A[k], spec[k].attr, `pre-paint attribute for "${k}" matches progress-store`);
    assert.equal(D[k], spec[k].first, `pre-paint default for "${k}" matches progress-store`);
  }

  // The storage key must match too, or preferences save to one place and load
  // from another.
  assert.ok(base.includes("'ol.settings.v1'"), 'pre-paint script reads the settings key progress-store writes');
  assert.ok(store.includes("SETTINGS_KEY = 'ol.settings.v1'"), 'settings key unchanged');

  // Every data-* attribute the script can set must actually be styled.
  const css = _rf('src/styles/tokens.css', 'utf8');
  for (const k of Object.keys(spec)) {
    if (k === 'theme') continue; // handled by [data-theme] + the media query
    assert.ok(css.includes(`[${spec[k].attr}=`),
      `tokens.css styles ${spec[k].attr}, otherwise the control does nothing`);
  }
}
console.log('reader preferences: all assertions passed ✓');
