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
