#!/usr/bin/env node
/**
 * Who may use Sky at each rollout stage.
 *
 * This is a security boundary, and it was missing entirely: /api/sky checked
 * only whether the mode was 'off', and the dock rendered whenever it was not.
 * Setting the mode to 'staff' — the FIRST step of the documented rollout —
 * would have served Sky to every anonymous visitor on the site.
 *
 * The tests that matter are the negative ones. It is easy to write a gate that
 * lets the right people in; the question is whether it keeps everyone else out,
 * and specifically whether it fails closed on every malformed input.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { skyAudience, bucketOf } from '../src/lib/sky-audience.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const route = readFileSync(ROOT + 'src/pages/api/sky.ts', 'utf8');
const dock = readFileSync(ROOT + 'src/components/Sky.tsx', 'utf8');
const base = readFileSync(ROOT + 'src/layouts/Base.astro', 'utf8');

let pass = 0;
const fail = [];
const ok = (c, what) => c ? pass++ : fail.push(what);

const anon = {};
const learner = { userId: 'learner-1', isStaff: false };
const staff = { userId: 'staff-1', isStaff: true };

// ------------------------------------------------------------------- off
ok(!skyAudience('off', staff).allowed, 'off refuses even staff');
ok(!skyAudience('off', anon).allowed, 'off refuses anonymous');

// ----------------------------------------------------------------- staff
/* The bug this file exists for. Before the fix, every one of these three was
   allowed, because nothing checked identity at all. */
ok(skyAudience('staff', staff).allowed, 'staff mode admits staff');
ok(!skyAudience('staff', anon).allowed,
   'staff mode REFUSES anonymous — the bug that would have shipped');
ok(!skyAudience('staff', learner).allowed,
   'staff mode refuses a signed-in learner; being signed in is not being staff');

// ----------------------------------------------------------------- slice
ok(skyAudience('slice', staff, 0).allowed,
   'staff are inside the slice even at 0% — they are the ones watching it');
ok(!skyAudience('slice', anon, 100).allowed,
   'anonymous is never in a sticky slice, even at 100%');
ok(!skyAudience('slice', learner, 0).allowed, 'a 0% slice admits no learner');
ok(skyAudience('slice', learner, 100).allowed, 'a 100% slice admits every learner');

/* Sticky, per 10g: "nobody flickers in and out". The same account must get the
   same answer every time, or a learner reports a bug nobody can reproduce. */
const first = skyAudience('slice', learner, 50).allowed;
ok([...Array(50)].every(() => skyAudience('slice', learner, 50).allowed === first),
   'the same account gets the same answer every time');

/* And the split should be roughly the requested size — a hash that clumps
   would make "10%" mean nothing. */
const ids = [...Array(2000)].map((_, i) => `user-${i}`);
const inSlice = ids.filter((id) => skyAudience('slice', { userId: id }, 25).allowed).length;
ok(inSlice > 400 && inSlice < 600,
   `a 25% slice admits roughly a quarter (got ${inSlice}/2000)`);
ok(new Set(ids.slice(0, 200).map(bucketOf)).size > 50,
   'buckets are spread rather than clumped');

// -------------------------------------------------------------- everyone
ok(skyAudience('everyone', anon).allowed,
   'everyone includes anonymous — learning here needs no account');
ok(skyAudience('everyone', learner).allowed, 'everyone includes learners');

// ------------------------------------------------------------ fails closed
ok(!skyAudience('EVERYONE', learner).allowed, 'an unknown mode is refused, not defaulted open');
ok(!skyAudience('', learner).allowed, 'an empty mode is refused');
ok(!skyAudience(undefined, staff).allowed, 'an undefined mode is refused');
ok(!skyAudience('staff', { userId: 'x', isStaff: 'yes' }).allowed,
   'isStaff must be the boolean true — a truthy string does not promote anyone');
ok(!skyAudience('slice', learner, NaN).allowed, 'a NaN percentage admits nobody');
ok(!skyAudience('slice', learner, undefined).allowed, 'a missing percentage admits nobody');

// -------------------------------------------------------- wired up at all
/* A correct function nothing calls is the failure mode this whole session keeps
   meeting, so assert the call sites too. */
ok(/skyAudience\(SKY_MODE, viewer, SKY_LIMITS\.slicePercent\)/.test(route),
   'the route applies the audience rule');
ok(/if \(!verdict\.allowed\)/.test(route), 'the route refuses when it says no');
ok(route.indexOf('skyAudience(SKY_MODE') < route.indexOf('await callModel('),
   'the audience check happens BEFORE any provider call, so a refusal is free');
ok(/const nobody = \{ userId: null, isStaff: false \}/.test(route),
   'identity resolution fails closed to nobody');
ok(/db\.auth\.getUser\(token\)/.test(route),
   'the token is verified rather than parsed and trusted');

ok(/if \(!mayUse\) return null/.test(dock), 'the dock renders nothing when refused');
ok(/skyAudience\(SKY_MODE, \{ userId: id, isStaff \}/.test(dock),
   'the dock applies the same audience rule the route does');

/* Base.astro keeps its mode check — with Sky off, shipping no island at all is
   correct and saves every visitor the bytes. What was wrong was that it was the
   ONLY check. Assert it no longer presents itself as the audience gate, so the
   next reader does not conclude visibility is settled there. */
ok(/not who may use it/i.test(base),
   'Base.astro says plainly that it decides existence, not audience');

// ---------------------------------------------------------------------- run
if (fail.length) {
  console.error('\nsky-audience: FAILED\n' + fail.map((f) => '  ✗ ' + f).join('\n') + '\n');
  process.exit(1);
}
console.log(`sky-audience: ${pass} tests passed`);
