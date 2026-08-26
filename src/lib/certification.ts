/** Certification vocabulary — design turn 10.
 *
 *  Turn 10i ends with a rule learned the hard way: "Tier names live in one
 *  content file. Renaming a tier later should be one edit, not a hunt through
 *  eight pages again." This is that file.
 *
 *  It exists because certification was promised across the site in nine places
 *  before anything could issue one. Turn 10i's instruction is to fix the copy
 *  FIRST — "before any certification code — so the site stops overclaiming
 *  today, whether or not the build lands on time."
 */

/** The two tiers. A record is earned by finishing a module; a certificate
 *  additionally requires passing its assessment. The design is firm that one
 *  cannot exist without the other: "No certificate without a Module Record
 *  first." */
export const TIERS = {
  record: {
    name: 'Module Record',
    plural: 'Module Records',
    earnedBy: 'finishing every lesson in a module',
  },
  certificate: {
    name: 'Lrnon Certificate',
    plural: 'Lrnon Certificates',
    earnedBy: 'passing the module assessment, once you hold its Module Record',
  },
} as const;

/** Attainment bands. Deliberately not pass/fail — "not yet" is a position on a
 *  path rather than a verdict, which is the same reasoning that keeps quiz
 *  retries unlimited and unpenalised. */
export const BANDS = {
  not_yet: { name: 'Not yet', meaning: 'More practice needed. Re-sit whenever you are ready.' },
  nearly:  { name: 'Nearly',  meaning: 'Close. A reviewer can upgrade this to Secure on request.' },
  secure:  { name: 'Secure',  meaning: 'Comfortably demonstrated.' },
} as const;

/** Which modules carry an assessment, and are therefore certificate-bearing.
 *
 *  DERIVED, never hard-coded to a number. Turn 10i asks the module filter to
 *  show "a count, so it can never imply more than exists" — and the surest way
 *  to honour that is to make the count impossible to state independently of
 *  the list. The design's own mock says "two modules are assessed today, E7 and
 *  Digital skills"; Lrnon has no Digital skills module, so shipping that number
 *  would have been the exact overclaim this frame exists to remove. */
export const ASSESSED_MODULES = ['e7'] as const;

export const assessedCount = () => ASSESSED_MODULES.length;
export const isAssessed = (moduleId: string) =>
  (ASSESSED_MODULES as readonly string[]).includes(moduleId);

/** The credential-code alphabet, and the shape a code takes.
 *
 *  10h: "Alphabet excludes 0/O and 1/I/L for handwriting and bad prints." Both
 *  halves of each pair go — dropping only the digits would leave exactly the
 *  ambiguity the rule exists to remove.
 *
 *  Defined once because it was briefly defined twice, and the second copy was
 *  wrong: `[A-Z2-9]` looks like it implements this rule and does not, since the
 *  letters O, I and L sit inside A-Z. A code containing one would have been
 *  accepted and sent to the database, where it can never match.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CH = '[A-HJKMNP-Z2-9]';
export const CODE_PATTERN = new RegExp(`^${CH}{4}-${CH}{3}-${CH}{3}$`);

/** Whether a learner can obtain a certificate today.
 *
 *  False until issuance exists. Every surface that mentions certification reads
 *  this rather than describing the state in prose, so the day it flips there is
 *  no stale sentence left promising something that has not shipped — and
 *  scripts/check-brand-claims.mjs fails if the brand guides disagree with it. */
export const CERTIFICATION_LIVE = false;

/** One sentence, used wherever the current state has to be stated plainly. */
export const certificationStatus = () =>
  CERTIFICATION_LIVE
    ? `Assessments are open for ${assessedCount()} module${assessedCount() === 1 ? '' : 's'}.`
    : 'Assessments are designed and not yet open. Module Records are issued today.';
