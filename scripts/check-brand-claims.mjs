#!/usr/bin/env node
/**
 * Brand-claim checker.
 *
 * The brand guides assert facts about Lrnon: how many modules are live, whether
 * certification exists, whether the assistant is switched on, that rooms are
 * closed. Every one of those goes stale the moment the product moves.
 *
 * A quietly-wrong brand guide is worse than no brand guide, because it is the
 * document that gets pasted into a funding application. So the claims get the
 * same treatment the curriculum already gives tool descriptions: measured
 * against reality, and a failure when they drift.
 *
 * Each probe below reads the repository rather than a note somebody wrote. When
 * certification is built, or the second Practitioner module ships, this fails
 * and names the guide and the sentence to change.
 *
 * Dependency-free: runs on a cold CI checkout before npm install.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const spec = JSON.parse(read('docs/brand/claims.json'));

const modules = JSON.parse(read('content/modules.json')).modules;
const liveIn = (track) =>
  modules.filter((m) => m.track === track && m.status === 'live').length;

/* Each probe answers one question about the product as it actually is. Kept
   deliberately literal — a probe that infers too much would drift from the
   claim it is meant to police. */
const probes = {
  explorerModulesLive: () => liveIn('explorer'),
  practitionerModulesLive: () => liveIn('practitioner'),
  builderModulesLive: () => liveIn('builder'),

  /* "Built" means a learner could obtain one: a route to reach, and somewhere
     to record it. A design document is not a certification. */
  certificationBuilt: () => {
    const pages = readdirSync(join(ROOT, 'src/pages'))
      .some((f) => /^certif|^cert\b/i.test(f));
    const migrations = existsSync(join(ROOT, 'supabase/migrations'))
      ? readdirSync(join(ROOT, 'supabase/migrations'))
          .some((f) => /certificat/i.test(read('supabase/migrations/' + f)))
      : false;
    return pages || migrations;
  },

  skyEnabled: () => !/SKY_MODE[^=]*=\s*'off'/.test(read('src/lib/sky-config.ts')),

  /* The gate ships false and needs a named owner AND deputy. Both halves are
     the claim, so check both survive in the migration.

     An earlier version of this probe looked for a literal `open = false` and
     reported a drift that was not real: the migration sets the column with a
     DEFAULT and seeds the row positionally, so the string never appears. A
     probe that cries wolf trains people to ignore it, which is worse than not
     having one — so this matches the two things that actually make the gate
     shut. */
  roomsShipClosed: () => {
    const sql = read('supabase/migrations/0007_rooms_and_doubts.sql');
    const defaultsClosed = /open\s+boolean\s+not\s+null\s+default\s+false/i.test(sql);
    const needsBothPeople = /safeguarding_owner is not null and deputy is not null/i.test(sql);
    return defaultsClosed && needsBothPeople;
  },

  /* Looks for a sponsor/affiliate arrangement appearing anywhere it would have
     to appear if one existed. Deliberately broad: a false alarm costs a minute,
     a missed one costs the brand. Excludes this checker and the guides that
     describe the prohibition. */
  sponsorshipMentions: () => {
    const roots = ['src', 'content', 'registry'];
    const pattern = /\b(sponsored\s+by|our\s+sponsor|affiliate\s+link|paid\s+placement|in\s+partnership\s+with)\b/i;
    let hits = 0;
    const walk = (dir) => {
      for (const name of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        const rel = dir + '/' + name.name;
        if (name.isDirectory()) { walk(rel); continue; }
        if (!/\.(astro|tsx?|jsx?|mdx|json|md)$/.test(name.name)) continue;
        if (pattern.test(read(rel))) hits++;
      }
    };
    roots.forEach(walk);
    return hits;
  },

  stalenessThresholdDays: () => {
    const m = read('scripts/validate-content.mjs').match(/age\s*>\s*(\d+)/);
    return m ? Number(m[1]) : -1;
  },
};

// ---------------------------------------------------------------- run
const problems = [];

for (const c of spec.claims) {
  const probe = probes[c.probe];
  if (!probe) { problems.push(`claim "${c.id}": no probe named ${c.probe}`); continue; }

  let actual;
  try { actual = probe(); }
  catch (e) { problems.push(`claim "${c.id}": probe threw — ${e.message}`); continue; }

  if (actual !== c.expect) {
    problems.push(
      `BRAND CLAIM DRIFTED — ${c.id}\n` +
      `    guides say : ${JSON.stringify(c.expect)}\n` +
      `    repo says  : ${JSON.stringify(actual)}\n` +
      `    where      : guide ${c.saidIn.join(', ')} — ${c.guideText}\n` +
      `    do         : ${c.onDrift}\n` +
      `    then update docs/brand/claims.json so the two agree again.`
    );
  }
}

/* The guides themselves go stale even when every claim still holds — tone,
   emphasis and what matters change. Same idea as a registry card's
   lastVerified, with a longer fuse. */
const today = process.env.OL_TODAY ? new Date(process.env.OL_TODAY) : new Date();
for (const [id, g] of Object.entries(spec.guides)) {
  const age = Math.floor((today - new Date(g.lastReviewed)) / 86400000);
  if (age > spec.reviewEveryDays) {
    problems.push(
      `brand guide ${id} (${g.file}) last reviewed ${age} days ago — ` +
      `over the ${spec.reviewEveryDays}-day review interval. Re-read it and ` +
      `bump lastReviewed in docs/brand/claims.json.`
    );
  }
}

if (problems.length) {
  console.error('\n' + problems.map((p) => '  ✗ ' + p).join('\n\n') + '\n');
  console.error(`Brand claims: ${problems.length} problem(s).\n`);
  process.exit(1);
}

console.log(
  `Brand claims: ${spec.claims.length} verified against the repo, ` +
  `${Object.keys(spec.guides).length} guides within the ${spec.reviewEveryDays}-day review interval.`
);
