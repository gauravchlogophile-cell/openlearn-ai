#!/usr/bin/env node
/**
 * The anti-hallucination guard on the weekly freshness job.
 *
 * propose-updates.mjs may ask a model whether a lesson claim still holds, but a
 * suggestion is only worth showing a person if the model can point at the words
 * on the source page that justify it. This pins that rule: a quotation that is
 * not on the page, or is too short to mean anything, never survives.
 */
import { evidenceIsOnPage, normalise, readableText } from './propose-updates.mjs';

let failed = 0;
const check = (name, ok) => { if (!ok) { failed++; console.error('FAIL', name); } };

const page = readableText(`<html><script>var x=1</script><body><h1>Data use</h1>
  <p>Google doesn’t use your prompts or responses to improve our products when you use Paid Services.</p></body></html>`);

check('exact quotation is accepted', evidenceIsOnPage("Google doesn't use your prompts or responses to improve our products", page));
check('typographic quotes and spacing do not matter', evidenceIsOnPage('Google  doesn’t use your prompts\nor responses to improve our products', page));
check('case does not matter', evidenceIsOnPage('GOOGLE DOESN’T USE YOUR PROMPTS OR RESPONSES', page));
check('an invented quotation is rejected', !evidenceIsOnPage('Google always trains on every prompt you submit anywhere', page));
check('a paraphrase is rejected', !evidenceIsOnPage('prompts are not used for improving products in paid mode', page));
check('a too-short quotation is rejected even if present', !evidenceIsOnPage('Paid Services', page));
check('an empty quotation is rejected', !evidenceIsOnPage('', page));
check('script text is not part of the page', !evidenceIsOnPage('var x=1 and more text here to pass length', page));
check('normalise folds quotes', normalise('“A”') === "'a'");

if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log('propose-updates guard: 9 checks passed');
