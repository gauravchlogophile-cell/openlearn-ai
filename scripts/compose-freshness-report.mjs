#!/usr/bin/env node
/**
 * Assembles the one weekly freshness issue from the three reports the job
 * produced: validate-content output, source-report.md, content-audit.json and
 * freshness-packet.md.
 *
 * Writes freshness-body.md and, when running in GitHub Actions, sets the step
 * output `actionable` so the workflow knows whether to open/refresh the issue
 * or close it as all clear.
 *
 * "Actionable" is deliberately narrower than "has any finding": a standing gap
 * such as a law named without a cited source belongs in the report, but if it
 * alone kept the issue open every week, people would learn to ignore the issue.
 */
import fs from 'node:fs';

const read = (f, d = '') => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : d);
const audit = JSON.parse(read('content-audit.json', '{"summary":{},"lessons":[]}'));
const s = audit.summary ?? {};
const validate = read('validate-report.txt');
const sources = read('source-report.md');
const packet = read('freshness-packet.md');

const changed = /## Sources that changed/.test(sources);
const cardsDue = /verification due|stale >120|lesson re-read due|lesson not re-read/.test(validate);
const dueLessons = (s.byStatus?.WARN ?? 0) + (s.byStatus?.FAIL ?? 0);
const broken = s.brokenLinks ?? 0;
const unsourced = s.lessonsNamingUnsourcedTools ?? 0;
const actionable = changed || cardsDue || dueLessons > 0 || broken > 0 || unsourced > 0;

const lines = [];
lines.push(`# Weekly content freshness — ${s.asOf ?? new Date().toISOString().slice(0, 10)}`, '');
lines.push(actionable ? '**Something needs a person to look.** Nothing has been edited automatically.' : 'All clear this week.', '');
lines.push('| Check | Result |', '|---|---|',
  `| Vendor / cited source pages that changed | ${changed ? '**yes — see below**' : 'no'} |`,
  `| Tool cards or lessons past their re-read window | ${cardsDue || dueLessons ? `**${dueLessons} lessons**${cardsDue ? ' and/or cards' : ''}` : 'none'} |`,
  `| Lessons naming a tool with no source on the page | ${unsourced} |`,
  `| Broken external links in lessons | ${broken} |`,
  `| Lessons naming a law with no cited source (standing gap) | ${s.lessonsWithLawAndNoSource ?? 0} |`, '');

if (sources.trim() && !/^No source changes detected/.test(sources.trim())) lines.push('## Source watch', '', sources.trim(), '');
if (validate.trim()) lines.push('<details><summary>Linter output</summary>', '', '```', validate.trim().slice(0, 4000), '```', '</details>', '');
if (packet.trim()) lines.push('## Review packet', '', packet.replace(/^# .*\n/, '').trim(), '');

lines.push('---',
  'Full per-lesson detail is in the `content-audit` artifact of this workflow run (`content-audit.md`).',
  'How to work through this: `docs/handbook/content-freshness.md`.',
  'Re-read the lesson, change what is wrong, set `lastVerified` to the day you actually checked, and run `node scripts/check-sources.mjs --update` so the baseline records that a person looked.');

let body = lines.join('\n');
if (body.length > 60000) body = body.slice(0, 60000) + '\n\n…truncated; see the artifact for the rest.';
fs.writeFileSync('freshness-body.md', body + '\n');

if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `actionable=${actionable}\n`);
console.log(`freshness report: actionable=${actionable} (changed=${changed}, due=${dueLessons}, cardsDue=${cardsDue}, broken=${broken}, unsourced=${unsourced})`);
