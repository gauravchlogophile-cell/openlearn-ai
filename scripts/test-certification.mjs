#!/usr/bin/env node
/**
 * Certification vocabulary and code-shape tests.
 *
 * The code pattern earns a test because it already had a bug that looked
 * correct. `[A-Z2-9]` reads as "the code alphabet" — it excludes the digits 0
 * and 1, which is half the rule — while quietly admitting the letters O, I and
 * L, which is the other half. 10h drops both members of each confusable pair
 * precisely so a code read off a photocopy is unambiguous, and a validator that
 * keeps the letters accepts codes the generator can never produce.
 *
 * The counts are here for a different reason: the design's own mock says "two
 * modules are assessed today — E7 and Digital skills", and Lrnon has one module
 * and no Digital skills. Any count typed by hand drifts from the list it
 * describes, so these assert that it cannot be typed by hand.
 *
 * Dependency-free, like the rest of scripts/.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const src = readFileSync(ROOT + 'src/lib/certification.ts', 'utf8');

let pass = 0;
const fail = [];
const ok = (cond, what) => cond ? pass++ : fail.push(what);

/* certification.ts is TypeScript and this runner is plain node, so the two
   values under test are read out of the source rather than imported. Narrow
   and deliberate: importing would need a build step for eight assertions. */
const ALPHABET = src.match(/CODE_ALPHABET = '([^']+)'/)?.[1] ?? '';
const CH = src.match(/const CH = '([^']+)'/)?.[1] ?? '';
const CODE = new RegExp(`^${CH}{4}-${CH}{3}-${CH}{3}$`);

// ---------------------------------------------------------------- alphabet
ok(ALPHABET.length > 0, 'CODE_ALPHABET is exported');

for (const bad of ['0', 'O', '1', 'I', 'L']) {
  ok(!ALPHABET.includes(bad),
     `the alphabet must not contain ${bad} — 10h drops both halves of each confusable pair`);
}

ok(new Set(ALPHABET).size === ALPHABET.length,
   'no character appears twice in the alphabet');

// ------------------------------------------------------------ the pattern
/* The bug this file exists for. Every excluded character, in a code that is
   otherwise perfectly shaped — the validator must reject all five. */
for (const bad of ['O', 'I', 'L']) {
  ok(!CODE.test(`ABCD-EF${bad}-HJK`),
     `a code containing the letter ${bad} is rejected (the bug: [A-Z2-9] accepts it)`);
}
for (const bad of ['0', '1']) {
  ok(!CODE.test(`ABCD-EF${bad}-HJK`),
     `a code containing the digit ${bad} is rejected`);
}

ok(CODE.test('ABCD-EFG-HJK'), 'a well-formed code is accepted');
ok(CODE.test('2345-678-9AB'), 'digits 2-9 are accepted');
ok(!CODE.test('ABC-EFG-HJK'),  'a short first group is rejected');
ok(!CODE.test('ABCDEFGHJK'),   'an ungrouped code is rejected');
ok(!CODE.test('abcd-efg-hjk'), 'lowercase is rejected before it reaches the database');
ok(!CODE.test(''),             'an empty code is rejected');

/* Every character the generator can emit must survive the validator. These are
   the two ends of the same rule and the only way they stay in step is a test
   that walks the whole alphabet. */
ok([...ALPHABET].every((c) => CODE.test(`${c}${c}${c}${c}-${c}${c}${c}-${c}${c}${c}`)),
   'every character the generator can produce passes the validator');

/* And the SQL generator's alphabet must match this one, or a code minted by the
   database gets rejected by the endpoint that verifies it. */
const sql = readFileSync(ROOT + 'supabase/migrations/0009_certification.sql', 'utf8');
const sqlAlphabet = sql.match(/alphabet text := '([^']+)'/)?.[1] ?? '';
ok(sqlAlphabet === ALPHABET,
   `the migration's alphabet matches certification.ts (sql: "${sqlAlphabet}")`);

// ------------------------------------------------------------ the counting
const assessed = src.match(/ASSESSED_MODULES = \[([^\]]*)\]/)?.[1] ?? '';
const listed = (assessed.match(/'[^']+'/g) ?? []).length;

ok(listed > 0, 'at least one module is listed as assessed');
ok(/assessedCount = \(\) => ASSESSED_MODULES\.length/.test(src),
   'the assessed count is derived from the list, never typed');
ok(!/assessedCount[^=]*=\s*\d/.test(src),
   'no literal number stands in for the assessed count');

/* The gate ships closed and the guides say so. Asserted here as well as in
   check-brand-claims.mjs because this is the file a future edit would touch. */
ok(/CERTIFICATION_LIVE = false/.test(src),
   'certification ships switched off');

// ---------------------------------------------------------------------- run
if (fail.length) {
  console.error('\ncertification: FAILED\n' + fail.map((f) => '  ✗ ' + f).join('\n') + '\n');
  process.exit(1);
}
console.log(`certification: ${pass} tests passed`);
