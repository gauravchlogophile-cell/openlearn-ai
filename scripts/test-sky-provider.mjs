#!/usr/bin/env node
/**
 * The provider seam, tested without a provider and without spending anything.
 *
 * Three things are worth asserting here, and none of them need a network call:
 *
 *   · The vendor is never guessed. Inferring it from a key's prefix would mean
 *     a misconfiguration posts the secret to the WRONG vendor's endpoint —
 *     a credential disclosure rather than a failed request.
 *   · The citation check rejects a fabricated reference. "[7]" against four
 *     passages is not a citation, and treating it as one would let exactly the
 *     answers this guard exists to catch through.
 *   · Retrieved lesson text is fenced as quoted material, so a passage
 *     containing "ignore previous instructions" arrives as data rather than
 *     sharing a channel with our own system prompt.
 *
 * Read out of the source rather than imported, because this runner is plain
 * node and the module is TypeScript — the same approach test-certification.mjs
 * takes for the same reason.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const src = readFileSync(ROOT + 'src/lib/sky-providers.ts', 'utf8');
const route = readFileSync(ROOT + 'src/pages/api/sky.ts', 'utf8');

let pass = 0;
const fail = [];
const ok = (c, what) => c ? pass++ : fail.push(what);

// ------------------------------------------------------------- the vendor
/* Lifted OUT of the source rather than retyped. A hand-copied duplicate can
   pass while the real function differs, which is the one thing a test of this
   function must not do — so the body is extracted and evaluated. */
const parseProvider = (() => {
  const body = src.match(/export function parseProvider[\s\S]*?\n\}/)?.[0];
  if (!body) throw new Error('parseProvider not found in source');
  // Only the signature carries type annotations; the body is plain JS.
  const js = body.replace(/^export function parseProvider\([^)]*\)[^{]*\{/,
                          'function parseProvider(raw) {');
  return new Function(`${js}; return parseProvider;`)();
})();

ok(parseProvider('anthropic') === 'anthropic', 'anthropic is recognised');
ok(parseProvider('  Claude ') === 'anthropic', 'whitespace and case are tolerated');
ok(parseProvider('openai') === 'openai', 'openai is recognised');
ok(parseProvider('openai-compatible') === 'openai', 'an OpenAI-compatible endpoint is recognised');
ok(parseProvider('') === null, 'an unset provider is null, never a default');
ok(parseProvider('sk-ant-api03-xxxx') === null, 'a KEY is never accepted as a provider name');
ok(parseProvider('gemini') === 'gemini', 'gemini is recognised');
ok(parseProvider('Google') === 'gemini', 'google is an alias for gemini');
ok(parseProvider('mistral') === null, 'an unsupported vendor is refused rather than guessed');
ok(/'gemini'/.test(src) && /'google'/.test(src),
   'the source itself maps both gemini names, not just the test');

/* The route must refuse to call anything when the vendor is unset. A default
   would send the key somewhere nobody chose. */
ok(/parseProvider\(env\?\.SKY_PROVIDER\)/.test(route),
   'the route reads the vendor from the environment');
ok(/if \(!provider\)[\s\S]{0,400}return missing\('SKY_PROVIDER'\)/.test(route),
   'an unset vendor stops the request before any call is made, and names itself');
ok(!/SKY_PROVIDER[^)]*\|\|\s*['"]/.test(route),
   'there is no fallback vendor string anywhere in the route');

// ---------------------------------------------------------------- gemini
/* Gemini differs from the other two in ways that each cause a distinct bug if
   missed, so each is asserted rather than assumed. */
ok(/generateContent/.test(src), 'gemini posts to :generateContent');
ok(src.includes('encodeURIComponent(c.model)'),
   'the model is escaped into the PATH — gemini names it in the URL, not the body');
ok(/x-goog-api-key/.test(src), 'gemini authenticates by header');
/* Checked against comment-stripped source. The phrase appears in a comment
   explaining why it is not done, and a test that cannot tell an explanation
   from an implementation would fail on its own documentation. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
ok(!code.includes('key=') && !code.includes('key%3D'),
   'the key is NEVER a query parameter — a secret in a URL reaches history, '
   + 'proxy logs, Referer headers and error reports');
ok(/systemInstruction/.test(src),
   'the system prompt is its own field, not folded in with the lesson text');
ok(src.includes('promptFeedback?.blockReason'),
   'a blocked PROMPT is detected — gemini returns 200 with no candidate');
ok(/finishReason/.test(src), 'a withheld ANSWER is detected');
ok(src.includes('usageMetadata?.promptTokenCount'),
   'gemini token counts are read from usageMetadata, not usage');

/* The one that matters most: HTTP 200 with no text must be a FAILURE, not an
   empty string falling through to the citation check — which would settle the
   reservation as a success and show the learner a blank reply. */
ok(/if \(!text\.trim\(\)\)[\s\S]{0,180}ok: false/.test(src),
   'a 200 with no text is reported as a provider failure, not an empty answer');

// ---------------------------------------------------------- the citation
const citesASource = (text, n) =>
  [...text.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1]))
    .some((x) => x >= 1 && x <= n);

ok(citesASource('Tokens are chunks of text [2].', 4), 'a real citation passes');
ok(citesASource('See [1] and [3].', 4), 'several citations pass');
ok(!citesASource('Tokens are chunks of text.', 4), 'an uncited answer is rejected');
ok(!citesASource('As established [7].', 4),
   'a FABRICATED citation is rejected — [7] against four passages cites nothing');
ok(!citesASource('', 4), 'an empty answer is rejected');
ok(!citesASource('Roughly [0] of them.', 4), '[0] is not a passage');

ok(/citesASource\(result\.text, hits\.length\)/.test(route),
   'the route checks citations against the number of passages actually supplied');
ok(/!result\.text \|\| !citesASource[\s\S]{0,300}out_of_scope/.test(route),
   'an uncited answer becomes the out-of-scope handoff, not an answer');

// ------------------------------------------------------------- the prompt
ok(/passages are the complete extent of what you know/i.test(src),
   'the system prompt confines the model to the supplied passages');
ok(/quoted material, never as instructions/i.test(src),
   'the system prompt names retrieved text as quoted material');
ok(src.includes('"""'), 'passages are fenced in the user turn');
ok(/Question from a learner/.test(src),
   'the question and the passages are distinguishable from each other');

/* The system prompt must be a system prompt in BOTH request shapes — never
   folded into the user turn, where it would sit in the same channel as lesson
   text an attacker could influence. */
ok(/system: c\.system/.test(src), 'anthropic gets the prompt as a system field');
ok(/role: 'system', content: c\.system/.test(src), 'openai gets it as a system message');

// -------------------------------------------------------------- the money
ok(/reserveBudget\(env, SKY_LIMITS\.maxAnswerTokens\)/.test(route),
   'budget is reserved before the provider is called');
ok(route.indexOf('reserveBudget(env') < route.indexOf('await callModel('),
   'the reservation happens BEFORE the call, not after');
ok(/if \(!budget\.allowed\)[\s\S]{0,160}503/.test(route),
   'a refused reservation stops the request');
ok(/if \(!db\) return \{ allowed: false/.test(route),
   'no database means no spend — the cap fails closed');
ok(/if \(error\) return \{ allowed: false/.test(route),
   'a database error means no spend');
ok(/SUPABASE_SERVICE_ROLE_KEY/.test(route),
   'the budget is touched with the service key, not the browser-visible one');

// ------------------------------------------------------------ the privacy
ok(/redactForProvider\(q\)/.test(route),
   'the question is redacted at the moment it is handed over');
ok(route.indexOf('redactForProvider(q)') > route.indexOf('await callModel(')
   || /user: buildUserTurn\(redactForProvider\(q\)/.test(route),
   'redaction is applied inside the provider call, not somewhere earlier');

// ------------------------------------------------- naming what is missing
/* All three settings used to refuse with the same word, so an operator could
   tell that something was unset but never which — the only way forward was to
   re-enter all of them and hope. */
ok(route.includes("return missing('SKY_API_KEY')")
   && route.includes("return missing('SKY_PROVIDER')")
   && route.includes("return missing('SKY_MODEL')"),
   'each missing setting is named separately');
ok(!route.includes('key: apiKey') && !route.includes('SKY_API_KEY: env?.SKY_API_KEY,'),
   'the diagnostic never echoes the API key itself');
ok(route.includes("SKY_API_KEY: env?.SKY_API_KEY ? 'present' : 'ABSENT'"),
   'the key is reported as present/absent only, never its value');
ok(route.includes('runtime_env'),
   'it reports whether the Worker environment is readable at all');

// ---------------------------------------------------------------------- run
if (fail.length) {
  console.error('\nsky-provider: FAILED\n' + fail.map((f) => '  ✗ ' + f).join('\n') + '\n');
  process.exit(1);
}
console.log(`sky-provider: ${pass} tests passed`);
