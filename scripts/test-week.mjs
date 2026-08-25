/** Tests for src/lib/week-core.js — the "Your week" panel on /home.
 *
 *  The panel makes claims to a learner about their own effort, so the things
 *  worth testing are the ones that would quietly lie: a day landing in the
 *  wrong column, a rest day showing as 0 instead of blank, and the 4am
 *  boundary disagreeing with the streak it sits beside.
 */
import assert from 'node:assert/strict';
import {
  weekDates, weekSummary, weekNote, greeting, DAY_LABELS, SECONDS_PER_CARD,
} from '../src/lib/week-core.js';
import { activityDate, streak } from '../src/lib/progress-core.js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('  ok ' + name); };

/* Dates are built in LOCAL time on purpose. activityDate() shifts by 4 hours
   and then reads local calendar fields, so a UTC literal like '10:00Z' lands
   on a different day depending on where the test runs — these tests would
   pass in Delhi and fail in Honolulu. Local constructors are stable
   everywhere, which is the only way a day-boundary test is worth having. */
const local = (y, m, d, h = 10) => new Date(y, m - 1, d, h, 0, 0);
const ev = (reason, at, ref) =>
  ({ id: reason + at.toISOString(), kind: 'xp', amount: 10, reason, ref, at: at.toISOString() });

// ---------------------------------------------------------------- weekDates
test('weekDates returns Mon→Sun and contains today', () => {
  const now = local(2026, 8, 26, 15);   // a Wednesday
  const d = weekDates(now);
  assert.equal(d.length, 7);
  assert.equal(d[0], '2026-08-24');               // Monday
  assert.equal(d[6], '2026-08-30');               // Sunday
  assert.ok(d.includes(activityDate(now)));
});

test('a Sunday still belongs to the week that started that Monday', () => {
  // Sunday is day 7, not day 1. Getting this wrong shifts the whole grid by
  // six days for one seventh of all readers.
  const d = weekDates(local(2026, 8, 30, 15));
  assert.equal(d[0], '2026-08-24');
  assert.equal(d[6], '2026-08-30');
});

test('weekDates crosses a month and a year boundary cleanly', () => {
  assert.deepEqual(weekDates(local(2027, 1, 1, 15))[0], '2026-12-28');
  assert.deepEqual(weekDates(local(2026, 9, 1, 15))[0], '2026-08-31');
});

// ------------------------------------------------------------- 4am boundary
test('the 4am boundary matches the streak, so panel and chip agree', () => {
  // 01:00 local-equivalent on Tuesday counts as Monday for BOTH.
  const lateNight = local(2026, 8, 25, 2);
  assert.equal(activityDate(lateNight), '2026-08-24');

  const state = { events: [ev('lesson_complete', lateNight, 'e1-l1')] };
  const w = weekSummary(state, {}, { 'e1-l1': 8 }, local(2026, 8, 26, 15));
  assert.equal(w.rows[0].values[0], 1, 'landed in Monday');
  assert.equal(w.rows[0].values[1], null, 'not in Tuesday');
  assert.equal(streak(state, local(2026, 8, 25, 15)), 1);
});

// -------------------------------------------------------------- aggregation
test('lessons, quizzes and cards land on the right days', () => {
  const now = local(2026, 8, 30, 15);
  const state = { events: [
    ev('lesson_complete', local(2026, 8, 24, 10), 'e1-l1'),
    ev('lesson_complete', local(2026, 8, 24, 11), 'e1-l2'),
    ev('module_quiz_pass', local(2026, 8, 24, 12), 'e1'),
    ev('lesson_complete', local(2026, 8, 27, 10), 'e1-l3'),
  ] };
  const w = weekSummary(state, { '2026-08-24': 12, '2026-08-27': 20 },
    { 'e1-l1': 8, 'e1-l2': 6, 'e1-l3': 10 }, now);

  assert.deepEqual(w.rows[0].values, [2, null, null, 1, null, null, null]);
  assert.deepEqual(w.rows[1].values, [1, null, null, 0, null, null, null]);
  assert.deepEqual(w.rows[2].values, [12, null, null, 20, null, null, null]);
  assert.equal(w.rows[0].total, 3);
  assert.equal(w.restDays, 5);
  assert.equal(w.activeDays, 2);
});

test('rest days are blank, not zero — and an active day CAN show a real zero', () => {
  // Thursday above had a lesson but no quiz: that zero is information. The
  // untouched days are nulls. Conflating the two is the bug this guards.
  const now = local(2026, 8, 30, 15);
  const w = weekSummary({ events: [ev('lesson_complete', local(2026, 8, 27, 10), 'x')] },
    {}, {}, now);
  assert.equal(w.rows[1].values[3], 0, 'no quiz on an active day is 0');
  assert.equal(w.rows[1].values[0], null, 'an inactive day is blank');
});

test('a day with only card reviews counts as active', () => {
  const now = local(2026, 8, 30, 15);
  const w = weekSummary({ events: [] }, { '2026-08-26': 9 }, {}, now);
  assert.equal(w.activeDays, 1);
  assert.equal(w.rows[2].values[2], 9);
});

test('events outside this week are ignored', () => {
  const now = local(2026, 8, 26, 15);
  const w = weekSummary({ events: [ev('lesson_complete', local(2026, 8, 1, 10), 'x')] },
    { '2026-07-30': 40 }, { x: 5 }, now);
  assert.equal(w.activeDays, 0);
  assert.equal(w.rows[3].total, 0);
});

// ------------------------------------------------------------------ minutes
test('minutes come from lesson length plus cards, never from a timer', () => {
  const now = local(2026, 8, 26, 15);
  const w = weekSummary({ events: [ev('lesson_complete', local(2026, 8, 24, 10), 'e1-l1')] },
    { '2026-08-24': 8 }, { 'e1-l1': 8 }, now);
  assert.equal(w.rows[3].values[0], Math.round(8 + (8 * SECONDS_PER_CARD) / 60));
});

test('an unknown lesson slug contributes 0 minutes, not a guess', () => {
  const now = local(2026, 8, 26, 15);
  const w = weekSummary({ events: [ev('lesson_complete', local(2026, 8, 24, 10), 'renamed')] },
    {}, {}, now);
  assert.equal(w.rows[3].values[0], 0);
  assert.equal(w.rows[0].values[0], 1, 'the lesson itself still counts');
});

// -------------------------------------------------------------------- notes
test('weekNote says something true in all three situations', () => {
  assert.match(weekNote({ restDays: 7, activeDays: 0 }), /Nothing yet/);
  assert.match(weekNote({ restDays: 0, activeDays: 7 }), /Every day/);
  assert.match(weekNote({ restDays: 1, activeDays: 6 }), /^One rest day/);
  assert.match(weekNote({ restDays: 2, activeDays: 5 }), /not a failure/);
});

test('labels are seven days starting Monday', () => {
  assert.deepEqual(DAY_LABELS, ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']);
});

// ----------------------------------------------------------------- greeting
test('greeting tracks local hours', () => {
  const at = (h) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d; };
  assert.equal(greeting(at(7)),  'Good morning');
  assert.equal(greeting(at(13)), 'Good afternoon');
  assert.equal(greeting(at(20)), 'Good evening');
  assert.equal(greeting(at(0)),  'Good morning');
});

console.log(`\nweek-core: ${n} tests passed`);
