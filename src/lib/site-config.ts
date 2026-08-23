/** Values the design treats as "Tweaks props" — the handful of things only the
 *  founder sets, which then update everywhere at once.
 *
 *  They live here rather than being typed into each page so that changing a
 *  phone number is one edit, not a search-and-replace across four templates.
 */

/* ------------------------------------------------------------------ contact */

/** TODO(founder): replace both before pushing.
 *  These appear on /feedback, /volunteer, /support and in the site footer.
 *  The design promises "a reply within two working days" against them, so put
 *  an address a human actually reads. */
export const CONTACT_EMAIL = 'hello@lrnon.org';

/** Shown as "Call or WhatsApp. Please keep to reasonable hours, IST."
 *  Set to an empty string to hide every phone row on the site — the layouts
 *  check for it, so removing it degrades cleanly rather than leaving a gap. */
export const CONTACT_PHONE = '';

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
