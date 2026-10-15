/** How Lrnon is funded, and the rules that keep that from changing how it teaches.
 *
 *  Until 15 October 2026 Lrnon was self-funded and promised no advertising and
 *  no sponsorship of any kind. It is now open to three kinds of money:
 *
 *    · donations, from anyone, learners included, never required and never
 *      nudged
 *    · grants
 *    · advertising, under the rules below
 *
 *  What did not change is the thing the earlier promise was protecting: a
 *  learner never pays, nothing is behind money, and nobody can buy their way
 *  into a lesson. "Free forever" is about the learner's side of the table.
 *  The advertising rules exist because the easy way to lose that is to let the
 *  money slowly start to decide what is taught, who sees what, or what is
 *  tracked.
 *
 *  Each rule here is written so a test can check it (scripts/test-funding.mjs),
 *  and the support page prints them from this list, so the page and the rules
 *  cannot drift apart.
 */

/** The advertising switch lives in site-config.ts; this file is only rules. */

export const AD_RULES = [
  {
    id: 'learning-surfaces',
    text: 'No advertisement appears inside a lesson, a quiz, the daily review, an assessment or certificate, the accessibility panel, Sky, the community rooms, Ask Doubts, or any account, privacy, child-safety or support page. Advertising is limited to a few browsing pages.',
  },
  {
    id: 'no-tracking',
    text: 'No tracking and no personalised or behavioural targeting, for anyone. No advertising-network scripts, cookies or identifiers. An advertisement is a labelled line of text, or an image kept on this site, with a plain link.',
  },
  {
    id: 'no-ai-vendors',
    text: 'No advertisement for an AI product, model, assistant or its maker, and none for any vendor named in a lesson or tool card, so that what Lrnon teaches cannot be bought.',
  },
  {
    id: 'categories',
    text: 'No gambling, alcohol, tobacco or vaping, loans or credit, crypto or trading, weight-loss or health claims, dating, adult content, political or religious campaigning, or services that write or sell students\' coursework.',
  },
  {
    id: 'labelled',
    text: 'Every advertisement is labelled "Advertisement" and names who paid for it.',
  },
  {
    id: 'separate',
    text: 'Advertising never touches the curriculum. An advertiser cannot see, ask for or pay for any change to a lesson, a tool card or a comparison.',
  },
  {
    id: 'calm',
    text: 'No advertisement moves, flashes, plays sound or starts anything by itself, and each one respects the reader\'s text size, contrast, font and motion settings like the rest of the page.',
  },
  {
    id: 'all-ages',
    text: 'Lrnon is open to every age and cannot tell who is reading, so anything shown must be suitable for any age.',
  },
  {
    id: 'published',
    text: 'Every advertisement, who paid, how much, the dates and who approved it is published in the public ledger and in the repository. Anyone can see what was shown and why.',
  },
];

/** Who may be told what they are giving for. Used by the support page. */
export const GIVING_TERMS = [
  'Giving is optional for everyone, learners included, and is never asked for inside a lesson, a quiz, a review or by Sky.',
  'Giving unlocks nothing: no feature, no priority, no badge, no certificate, no mention in a lesson.',
  'Donors are not ranked or compared. The ledger lists every contribution in date order, with no tiers.',
  'If you are under 18, please give only with a parent or guardian\'s agreement.',
  'A gift cannot be conditional on covering, ranking or recommending a product. Money with that attached is declined.',
];

/** Pages where an advertisement may appear, if advertising is on at all.
 *  Fails closed: anything not listed is refused, including pages that do not
 *  exist yet, so adding a lesson route or a new tool cannot accidentally gain
 *  an ad slot. */
export const AD_ALLOWED_PATHS = [/^\/$/, /^\/roadmap\/?$/, /^\/whats-new\/?$/];

export function adSlotAllowed(path) {
  if (typeof path !== 'string') return false;
  return AD_ALLOWED_PATHS.some((re) => re.test(path));
}

/** What an advertiser may sell. An allow-list, so the default for anything new
 *  is no. */
export const AD_ALLOWED_CATEGORIES = [
  'books-and-stationery',
  'devices-and-accessories',
  'accessibility-tools',
  'libraries-and-nonprofits',
  'general-software',
  'training-and-courses',
];

const TRACKING_PARAMS = /[?&](utm_[a-z]+|gclid|fbclid|msclkid|igshid|mc_eid|_hsenc|yclid)=/i;
const AD_NETWORK_HOSTS = /(doubleclick|googlesyndication|googleadservices|adservice|taboola|outbrain|criteo|adsterra|propellerads|media\.net|amazon-adsystem|adnxs)\./i;
const AI_WORDS = /\b(AI|A\.I\.|artificial intelligence|machine learning|LLM|GPT|chatbot|copilot|assistant|generative)\b/i;

/** Problems with a proposed advertisement, as plain sentences. Empty means it
 *  meets every rule that can be checked mechanically. The rest (is it suitable
 *  for every age, is it honest) is a person's judgement, recorded in
 *  approvedBy.
 *  @param {object} ad
 *  @param {{ vendors: string[] }} ctx  names of every vendor and product the lessons name */
export function validateAd(ad, ctx) {
  const problems = [];
  const need = (k) => { if (!ad?.[k]) problems.push(`missing ${k}`); };
  ['id', 'advertiser', 'category', 'text', 'href', 'startsOn', 'endsOn', 'paidAmount', 'paidCurrency', 'approvedBy', 'approvedOn'].forEach(need);
  if (problems.length) return problems;

  if (!AD_ALLOWED_CATEGORIES.includes(ad.category)) problems.push(`category "${ad.category}" is not on the allowed list`);
  if (ad.text.length > 160) problems.push('text is longer than 160 characters');
  if (!/^https:\/\/[^\s]+$/.test(ad.href)) problems.push('link must be an https address');
  if (TRACKING_PARAMS.test(ad.href)) problems.push('link carries tracking parameters');
  if (AD_NETWORK_HOSTS.test(ad.href)) problems.push('link goes through an advertising network');
  if (ad.image && !/^\/ads\/[a-z0-9._-]+\.(png|jpe?g|webp|svg)$/i.test(ad.image)) problems.push('image must be a file kept on this site under /ads/');
  if (ad.image && !ad.imageAlt) problems.push('an image needs alt text');
  if (new Date(ad.endsOn) <= new Date(ad.startsOn)) problems.push('endsOn must be after startsOn');

  const words = `${ad.advertiser} ${ad.text}`;
  if (AI_WORDS.test(words)) problems.push('mentions AI, an assistant or similar: no AI advertising (rule: no-ai-vendors)');
  for (const v of ctx?.vendors ?? []) {
    if (v && new RegExp(`\\b${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(words)) {
      problems.push(`names "${v}", a vendor or product the lessons cover (rule: no-ai-vendors)`);
    }
  }
  return problems;
}
