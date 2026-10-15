#!/usr/bin/env node
/**
 * The rules that make "open to donations and advertising" compatible with "free
 * forever for every learner".
 *
 * Lrnon moved from self-funded, with a promise of no ads and no sponsorship, to
 * being open to donations, grants and advertising. A promise of "no ads" was
 * simple to keep and simple to check. A policy of "ads, but only like this" is
 * only worth anything if it is as easy to check, so each rule is a test:
 * where an advertisement may appear (fails closed), what an advertiser may be,
 * that nothing from an ad network can load, and that the old promise has been
 * taken out everywhere it was made rather than left to contradict the new one.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';
import {
  AD_RULES, GIVING_TERMS, AD_ALLOWED_PATHS, AD_ALLOWED_CATEGORIES, adSlotAllowed, validateAd,
} from '../src/lib/funding-policy.js';
import { ADS } from '../src/lib/ads.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
let failed = 0, passed = 0;
const check = (name, ok, extra = '') => { if (ok) passed++; else { failed++; console.error('FAIL', name, extra); } };

function walk(dir, exts, skip = []) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (skip.some((s) => p.split(sep).includes(s))) continue;
    if (statSync(p).isDirectory()) out.push(...walk(p, exts, skip));
    else if (exts.some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
}
const rel = (p) => relative(ROOT, p).split(sep).join('/');

/* ---- where an advertisement may appear: only on a few browsing pages -------- */
for (const ok of ['/', '/roadmap', '/roadmap/', '/whats-new']) check(`ads may appear on ${ok}`, adSlotAllowed(ok));
const never = [
  '/learn/explorer/e1/l1-ai-in-your-daily-life', '/learn/practitioner/p8/l1-where-the-data-goes', '/quiz/e1', '/review',
  '/certification', '/certification/e1', '/v', '/safeguarding', '/privacy', '/terms', '/support', '/account', '/admin',
  '/admin/sky', '/community', '/doubts', '/members', '/reading', '/volunteer', '/feedback', '/offline', '/home',
];
for (const p of never) check(`ads never appear on ${p}`, !adSlotAllowed(p));
check('a path nobody has heard of is refused (fails closed)', !adSlotAllowed('/some-new-page'));
check('a lookalike path is refused', !adSlotAllowed('/roadmap/../learn/x') && !adSlotAllowed('/roadmapx') && !adSlotAllowed('//'));
check('a non-string is refused', !adSlotAllowed(undefined) && !adSlotAllowed(null) && !adSlotAllowed(42));
check('only a handful of pages are allowed at all', AD_ALLOWED_PATHS.length <= 4);

/* ---- where the code puts AdSlot ------------------------------------------- */
const USES_ADSLOT = /imports+AdSlot|<AdSlot/;
{
  const allowedFiles = new Set(['src/pages/index.astro', 'src/pages/roadmap.astro', 'src/pages/whats-new.astro', 'src/components/AdSlot.astro']);
  const users = walk(join(ROOT, 'src'), ['.astro', '.tsx', '.ts'])
    .filter((f) => USES_ADSLOT.test(readFileSync(f, 'utf8')))
    .map(rel);
  const stray = users.filter((f) => !allowedFiles.has(f));
  check('AdSlot is used only on the allowed pages', stray.length === 0, stray.join(', '));
  const forbidden = ['src/layouts/Base.astro', 'src/pages/learn/[...slug].astro', 'src/pages/quiz/[module].astro', 'src/components/SkyBuddy.tsx', 'src/components/AccessibilityPanel.tsx'];
  for (const f of forbidden) check(`${f} has no ad slot`, !USES_ADSLOT.test(read(f)));
}

/* ---- nothing from an advertising network can load -------------------------- */
{
  const NETWORKS = /(doubleclick|googlesyndication|googleadservices|adservice\.google|taboola|outbrain|criteo|adsterra|propellerads|media\.net|amazon-adsystem|adnxs|adsbygoogle)/i;
  const hits = walk(join(ROOT, 'src'), ['.astro', '.tsx', '.ts', '.js', '.css'])
    .filter((f) => !/funding-policy.js$/.test(f))   // that file's job is to NAME them
    .filter((f) => NETWORKS.test(readFileSync(f, 'utf8'))).map(rel);
  check('no advertising-network host appears anywhere in the source', hits.length === 0, hits.join(', '));
  check('no ad-network script in the public folder', !walk(join(ROOT, 'public'), ['.js', '.html']).some((f) => NETWORKS.test(readFileSync(f, 'utf8'))));
  const headers = read('scripts/generate-headers.mjs');
  check('the content policy still allows scripts only from this site', /script-src \$\{scriptSrc\}/.test(headers) && !/script-src[^;]*https?:/.test(headers));
  check('the content policy still allows images only from this site', /img-src 'self' data:/.test(headers));
}

/* ---- the rules about who may advertise -------------------------------------- */
const vendors = ['ChatGPT', 'OpenAI', 'Claude', 'Anthropic', 'Gemini', 'Google', 'Microsoft Copilot', 'Perplexity', 'Midjourney'];
const good = {
  id: 'books-2026-11', advertiser: 'Hill Road Books', category: 'books-and-stationery',
  text: 'Second-hand paperbacks, posted free within India.', href: 'https://hillroadbooks.example/',
  startsOn: '2026-11-01', endsOn: '2026-11-30', paidAmount: 5000, paidCurrency: 'INR',
  approvedBy: 'A. Reviewer', approvedOn: '2026-10-28',
};
check('a plain, paid, approved advertisement passes', validateAd(good, { vendors }).length === 0, JSON.stringify(validateAd(good, { vendors })));
const bad = (patch, why) => check(`refused: ${why}`, validateAd({ ...good, ...patch }, { vendors }).length > 0);
bad({ advertiser: 'OpenAI' }, 'an AI vendor as advertiser');
bad({ text: 'Try ChatGPT free for a month.' }, 'a named AI product in the text');
bad({ text: 'The AI study assistant students love.' }, 'AI wording');
bad({ text: 'Our new generative tutor.' }, 'generative wording');
bad({ category: 'gambling' }, 'a banned category');
bad({ category: 'loans-and-credit' }, 'a category not on the allow-list');
bad({ href: 'http://hillroadbooks.example/' }, 'a non-https link');
bad({ href: 'https://hillroadbooks.example/?utm_source=lrnon' }, 'a tracking parameter');
bad({ href: 'https://ads.doubleclick.net/click?x=1' }, 'a link through an ad network');
bad({ image: 'https://cdn.example/banner.png', imageAlt: 'x' }, 'an image hosted elsewhere');
bad({ image: '/ads/banner.png' }, 'an image without alt text');
bad({ approvedBy: '' }, 'no approver');
bad({ paidAmount: 0 }, 'no payment recorded');
bad({ endsOn: '2026-10-01' }, 'an end date before the start');
bad({ text: 'x'.repeat(161) }, 'text over 160 characters');
check('an image kept on this site with alt text passes',
  validateAd({ ...good, image: '/ads/hill-road.webp', imageAlt: 'A stack of paperbacks' }, { vendors }).length === 0);
check('the allow-list of categories is short', AD_ALLOWED_CATEGORIES.length <= 8);

/* ---- what is in ads.js right now must itself obey the rules ------------------ */
{
  const cards = readdirSync(join(ROOT, 'registry')).filter((f) => /^[a-z].*\.json$/.test(f))
    .map((f) => JSON.parse(read('registry/' + f)));
  const real = [...new Set(cards.flatMap((c) => [c.name, c.vendor]).filter(Boolean))];
  for (const ad of ADS) {
    const p = validateAd(ad, { vendors: real });
    check(`ads.js entry "${ad.id}" breaks no rule`, p.length === 0, p.join('; '));
  }
  check('ids in ads.js are unique', new Set(ADS.map((a) => a.id)).size === ADS.length);
}

/* ---- the policy is printed from one list, and giving is described honestly --- */
{
  const support = read('src/pages/support.astro');
  check('the support page prints the advertising rules from the policy list', /AD_RULES/.test(support) && /id="advertising"/.test(support));
  check('the support page prints the giving terms from the policy list', /GIVING_TERMS/.test(support));
  check('there is a rule for every surface that matters', ['learning-surfaces', 'no-tracking', 'no-ai-vendors', 'categories', 'labelled', 'separate', 'calm', 'all-ages', 'published']
    .every((id) => AD_RULES.some((r) => r.id === id)));
  check('giving terms say it unlocks nothing', GIVING_TERMS.some((t) => /unlocks nothing/i.test(t)));
  check('giving terms protect under-18s', GIVING_TERMS.some((t) => /under 18/i.test(t)));
  check('giving terms refuse money with strings attached', GIVING_TERMS.some((t) => /conditional/i.test(t)));
  check('the footer links to how Lrnon is funded', /href="\/support"/.test(read('src/layouts/Base.astro')));
}

/* ---- the old promise has been taken out, not left to contradict the new ------ */
{
  const OLD = /\b(no ads|ad-free|free of ads|without ads|no advertising(?![- ]network)|never show(?:s)? (?:any )?advertis|no sponsorship, ever|takes no sponsorship)\b/i;
  const files = [
    ...walk(join(ROOT, 'src'), ['.astro', '.tsx', '.ts', '.js']),
    ...walk(join(ROOT, 'docs/brand'), ['.md']),
    join(ROOT, 'README.md'),
  ];
  const stale = [];
  for (const f of files) {
    if (/test-funding|funding-policy\.js$/.test(f)) continue;
    const lines = readFileSync(f, 'utf8').split('\n');
    lines.forEach((l, i) => {
      if (OLD.test(l) && !/\bwas\b|\bformerly\b|until 15 October|used to say|previously|promised|no longer|stopped being|never write|do not say|before 2026-10-15/i.test(l)) stale.push(`${rel(f)}:${i + 1}: ${l.trim().slice(0, 90)}`);
    });
  }
  check('no page or guide still promises "no ads" or "no sponsorship, ever"', stale.length === 0, '\n  ' + stale.join('\n  '));
}

if (failed) { console.error(`${failed} check(s) failed, ${passed} passed`); process.exit(1); }
console.log(`funding: ${passed} checks passed`);
