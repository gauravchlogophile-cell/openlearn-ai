/** The advertisements that may be shown. Today: none.
 *
 *  This list is the whole of what advertising on Lrnon can be. There is no
 *  advertising network, no script from anyone else, no auction. An entry is added
 *  here by a person, in a commit that anyone can read, after the rules in
 *  funding-policy.js have been checked and a named person has approved it.
 *
 *  Shape of an entry (every field is required unless marked):
 *
 *    {
 *      id: 'books-2026-11',              stable key; appears in the ledger
 *      advertiser: 'Example Books',      who paid
 *      category: 'books-and-stationery', one of AD_ALLOWED_CATEGORIES
 *      text: 'Second-hand paperbacks, posted free in India.',   up to 160 characters
 *      href: 'https://example.com/',     https, no tracking parameters
 *      image: '/ads/books.webp',         optional, kept on this site
 *      imageAlt: 'A stack of paperbacks', required with an image
 *      relatesTo: [],                    ids of any registry card the advertiser or text
 *                                        names, so it is labelled as an advertiser
 *                                        beside that tool (required when it does)
 *      startsOn: '2026-11-01', endsOn: '2026-11-30',
 *      paidAmount: 5000, paidCurrency: 'INR',
 *      approvedBy: 'name of the person who read it', approvedOn: '2026-10-28',
 *    }
 *
 *  scripts/test-funding.mjs refuses a build in which any entry here breaks a
 *  rule that can be checked by a machine.
 */
export const ADS = [];
