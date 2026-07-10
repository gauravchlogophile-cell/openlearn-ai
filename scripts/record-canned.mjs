#!/usr/bin/env node
/** Maintainer tool: record a live model output into a canned case draft.
 *  Usage: ANTHROPIC_API_KEY=... node scripts/record-canned.mjs "your prompt"
 *  Writes drafts to content/canned/_drafts/ for human review — canned cases
 *  are ALWAYS reviewed and annotated before publishing (they're teaching
 *  material, not raw dumps). Providers: Anthropic today; adapters welcome. */
import { writeFileSync, mkdirSync } from 'node:fs';

const prompt = process.argv.slice(2).join(' ');
const key = process.env.ANTHROPIC_API_KEY;
if (!prompt) { console.error('Usage: record-canned.mjs "<prompt>"'); process.exit(1); }
if (!key) { console.error('Set ANTHROPIC_API_KEY (maintainers only — never commit keys).'); process.exit(1); }

const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
  body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }] }),
});
if (!res.ok) { console.error('API error', res.status, await res.text()); process.exit(1); }
const data = await res.json();
const output = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');

mkdirSync('content/canned/_drafts', { recursive: true });
const file = 'content/canned/_drafts/' + Date.now() + '.json';
writeFileSync(file, JSON.stringify({
  id: 'REPLACE-ME', title: 'REPLACE-ME', task: 'REPLACE-ME',
  prompt, output, notes: ['REPLACE: why does this prompt work?'],
  recordedWith: data.model, recordedAt: new Date().toISOString(),
}, null, 2));
console.log('Draft written to ' + file + ' — review, annotate, then move into sandbox.json.');
