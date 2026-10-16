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
 *
 *  On 16 October 2026 the advertising rules were changed again, at the owner's
 *  instruction. They used to ban advertisements for AI products and for any
 *  vendor the lessons name. They now allow anyone to advertise, including those
 *  companies, and replace the ban with a conflict-of-interest rule: a conflict
 *  is not hidden from the learner it could affect. That is how a newspaper or a
 *  journal handles it, and it suits a project that names real products: an
 *  advertiser that is also described in a lesson is labelled as an advertiser
 *  next to that description, for as long as it advertises and for 90 days after,
 *  its advertisement can never sit on a page that is about it, and every
 *  advertiser and promoter is listed in the open.
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
    id: 'conflict-of-interest',
    text: 'Anyone may advertise, including a company whose product Lrnon teaches about. What is never allowed is hiding the conflict from the learner it could affect. An advertiser that Lrnon also describes is named as an advertiser beside that description, on its tool card and in every lesson that names it, while the advertisement runs and for 90 days after. Its advertisement never appears on a page about it.',
  },
  {
    id: 'public-register',
    text: 'Every advertiser and promoter is listed in the open, on the support page and in the repository: who they are, what they paid, the dates, the pages involved, and who approved it. Nothing is paid for in private.',
  },
  {
    id: 'separate',
    text: 'Payment buys nothing in the curriculum. An advertiser cannot see, ask for or pay for any change to a lesson, a tool card, a comparison or what Sky says, and a request to do so is declined and recorded.',
  },
  {
    id: 'no-tracking',
    text: 'No tracking and no personalised or behavioural targeting, for anyone. No advertising-network scripts, cookies or identifiers. An advertisement is a labelled line of text, or an image kept on this site, with a plain link.',
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
    id: 'calm',
    text: 'No advertisement moves, flashes, plays sound or starts anything by itself, and each one respects the reader\'s text size, contrast, font and motion settings like the rest of the page.',
  },
  {
    id: 'all-ages',
    text: 'Lrnon is open to every age and cannot tell who is reading, so anything shown must be suitable for any age.',
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
 *  an ad slot. None of these is about a product, which is what makes the
 *  "never on a page about the advertiser" rule true by construction. */
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
  'ai-products-and-services',
];

/** How long a vendor stays labelled as an advertiser after its advertisement
 *  ends. A conflict does not stop the day the invoice does. */
export const DISCLOSURE_TAIL_DAYS = 90;

const TRACKING_PARAMS = /[?&](utm_[a-z]+|gclid|fbclid|msclkid|igshid|mc_eid|_hsenc|yclid)=/i;
const AD_NETWORK_HOSTS = /(doubleclick|googlesyndication|googleadservices|adservice|taboola|outbrain|criteo|adsterra|propellerads|media\.net|amazon-adsystem|adnxs)\./i;

const esc = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Which registry cards an advertisement is about: any card whose name or
 *  vendor appears in the advertiser's name or the advertisement's text.
 *  @param {{advertiser:string,text:string}} ad
 *  @param {{id:string,name?:string,vendor?:string}[]} cards */
export function cardsNamedBy(ad, cards) {
  const words = `${ad.advertiser} ${ad.text}`;
  return (cards ?? []).filter((c) => [c.name, c.vendor].filter(Boolean)
    .some((v) => new RegExp(`\\b${esc(v)}\\b`, 'i').test(words))).map((c) => c.id);
}

/** Problems with a proposed advertisement, as plain sentences. Empty means it
 *  meets every rule that can be checked mechanically. The rest (is it suitable
 *  for every age, is it honest) is a person's judgement, recorded in
 *  approvedBy.
 *
 *  The conflict-of-interest rule is checked here by making the disclosure
 *  impossible to forget: if the advertiser or the text names a vendor or product
 *  Lrnon has a card for, the entry must list that card in relatesTo, because
 *  relatesTo is what puts the "advertiser" label on the card and in the lessons.
 *  @param {object} ad
 *  @param {{ cards: {id:string,name?:string,vendor?:string}[] }} ctx */
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

  const named = cardsNamedBy(ad, ctx?.cards);
  const declared = ad.relatesTo ?? [];
  for (const id of named) {
    if (!declared.includes(id)) {
      problems.push(`names "${id}", a tool Lrnon describes: list it in relatesTo so it is labelled as an advertiser beside its description (rule: conflict-of-interest)`);
    }
  }
  for (const id of declared) {
    if (!(ctx?.cards ?? []).some((c) => c.id === id)) problems.push(`relatesTo lists "${id}", which is not a registry card`);
  }
  return problems;
}

/** Advertisers to disclose beside a tool: those whose advertisement lists this
 *  card, while it runs and for DISCLOSURE_TAIL_DAYS after it ends.
 *  @param {string} cardId @param {object[]} ads @param {string} today  YYYY-MM-DD */
export function advertisersFor(cardId, ads, today) {
  const t = new Date(today + 'T00:00:00Z').getTime();
  return (ads ?? []).filter((a) => (a.relatesTo ?? []).includes(cardId)
    && new Date(a.startsOn + 'T00:00:00Z').getTime() <= t
    && t <= new Date(a.endsOn + 'T00:00:00Z').getTime() + DISCLOSURE_TAIL_DAYS * 86400000)
    .map((a) => ({ advertiser: a.advertiser, endsOn: a.endsOn, id: a.id }));
}
