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
 * Deliberately ships as 'hidden'.
 *
 * Asking the public for money is not a styling decision. Lrnon is not yet a
 * registered charity — the page says so itself — and turning this on has
 * financial and, depending on jurisdiction, legal consequences that are the
 * founder's to weigh and not a side effect of merging a redesign branch. The
 * page is written and ready; flipping this one value publishes it.
 */
export type FundingMode = 'hidden' | 'partial' | 'published';
export const FUNDING_MODE: FundingMode = 'hidden';

/** Display currency for the ledger. The design ships twenty currencies chosen
 *  by how widely they are used; the ledger always records what actually
 *  arrived, in the currency it arrived in, so this only affects presentation. */
export const CURRENCY = { code: 'INR', name: 'Indian rupee', symbol: '₹' };

/* ------------------------------------------------------------ share tracking */

/** Appended to shared links. The design is explicit that this carries no
 *  tracker and sets no cookie: it reports how many people arrived from shares
 *  in total, never who shared. Keep it that way. */
export const SHARE_PARAM = 'from';
