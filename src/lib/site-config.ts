/** Values the design treats as "Tweaks props" — the handful of things only the
 *  founder sets, which then update everywhere at once.
 *
 *  They live here rather than being typed into each page so that changing a
 *  phone number is one edit, not a search-and-replace across four templates.
 */

/* ------------------------------------------------------------------ contact */

/** The address every page promises a reply on within two working days.
 *
 *  This is a build-time constant on purpose: the footer appears on every page,
 *  including cached ones served offline by the service worker, so fetching it
 *  at runtime would mean a visible gap on first paint and a blank line with no
 *  network. Changing it is a one-line edit and a deploy.
 *
 *  Making it editable from /admin without a deploy needs a settings row plus a
 *  runtime read on the pages that show it — worth doing when there is more
 *  than one value to manage, not for a single address.
 *  These appear on /feedback, /volunteer, /support and in the site footer.
 *  The design promises "a reply within two working days" against them, so put
 *  an address a human actually reads. */
export const CONTACT_EMAIL = 'lrnon.org@gmail.com';

/* There is deliberately no second address here.
 *
 * Everything the site says publicly, and everything an administrator answers,
 * goes to CONTACT_EMAIL — including child-safety reports on /safeguarding.
 * One published address is what makes the work handable over: an admin
 * volunteer can be given the inbox and cover operations without anything on
 * the site changing, and without a learner's report following a person who has
 * moved on.
 *
 * The founder's own address is a SUPER-ADMIN ACCOUNT, not a contact route. It
 * holds the super_admin role in the database and grants the permissions an
 * admin works under; it is not printed anywhere and does not belong in this
 * file. Who holds which role, and how a new admin is onboarded, is recorded in
 * docs/ops/roles.md. */

/** Shown as "Call or WhatsApp. Please keep to reasonable hours, IST."
 *  Set to an empty string to hide every phone row on the site — the layouts
 *  check for it, so removing it degrades cleanly rather than leaving a gap.
 *
 *  Annotated `string` rather than inferred. Without it the value has the
 *  literal type '', so TypeScript proves `CONTACT_PHONE && …` can never be
 *  true and narrows the guarded branch to `never` — which broke the phone
 *  rows in Base.astro, /feedback and /volunteer the moment typechecking was
 *  switched on, and would have kept them broken on the day a number was
 *  finally filled in. That day is today, and the rows came up correctly —
 *  which is the whole reason the annotation was worth adding before there was
 *  a number to put in it.
 *
 *  Spaced for reading aloud and copying off a screen; every `tel:` link strips
 *  the spaces itself, so the display form and the dial form are the same
 *  value. */
export const CONTACT_PHONE: string = '+91 81782 31945';

/* ------------------------------------------------------------------ funding */

/**
 * The founder switch from the design.
 *
 *   'hidden'    /support redirects home and the Support link is not rendered.
 *   'partial'   The page explains where the project stands and invites people
 *               to register interest. No giving mechanism, no ledger.
 *   'published' Everything: the six areas, currency picker and public ledger.
 *
 * Moved from 'hidden' to 'published' on 2026-10-15, at the owner's instruction,
 * together with the funding policy in funding-policy.js.
 *
 * It shipped as 'hidden' deliberately. Asking the public for money is not a
 * styling decision: Lrnon is not yet a registered charity (the page says so
 * itself), and receiving money has financial and, depending on jurisdiction,
 * legal and tax consequences that belong to the owner and not to a redesign
 * branch. The owner has now weighed them and opened giving. Two things are worth
 * keeping in mind that this file cannot settle: whether an unregistered
 * initiative may receive gifts from abroad, and how gifts are treated for tax.
 * Both are questions for an accountant. If giving needs to pause while that is
 * answered, set this back to 'partial' (the page explains and takes interest
 * only) and nothing else changes.
 */
export type FundingMode = 'hidden' | 'partial' | 'published';
export const FUNDING_MODE: FundingMode = 'published';

/**
 * Advertising. 'off' shows nothing, ever; 'on' lets AdSlot show an approved
 * entry from ads.js, on the few pages funding-policy.js allows, and nowhere
 * else.
 *
 * Lrnon is open to advertising as of 2026-10-15, under the rules in
 * funding-policy.js, and shows none today: there is no advertiser, no approved
 * entry and no ad network. Switching this to 'on' with an empty ads.js still
 * shows nothing, which is the point: the switch alone cannot put anything in
 * front of a learner. The rules are checked by scripts/test-funding.mjs.
 *
 * Before turning it on for real, update /privacy and /safeguarding to describe
 * what is shown, and publish the first ledger row. The tests insist the
 * advertising rules appear on /support, but not that those two pages were read.
 */
export type AdMode = 'off' | 'on';
export const AD_MODE: AdMode = 'off';

/** Display currency for the ledger. The design ships twenty currencies chosen
 *  by how widely they are used; the ledger always records what actually
 *  arrived, in the currency it arrived in, so this only affects presentation. */
export const CURRENCY = { code: 'INR', name: 'Indian rupee', symbol: '₹' };

/* ------------------------------------------------------------ share tracking */

/** Appended to shared links. The design is explicit that this carries no
 *  tracker and sets no cookie: it reports how many people arrived from shares
 *  in total, never who shared. Keep it that way. */
export const SHARE_PARAM = 'from';
