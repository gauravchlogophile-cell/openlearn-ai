# Funding and advertising

Since 15 October 2026 Lrnon is open to donations, grants and advertising, and
free for every learner, always. The reasoning is in `docs/brand/philosophy.md`
under *Funding*. This page is the mechanics.

## What is switched on

| Thing | Where | State |
|---|---|---|
| Giving page and public ledger | `FUNDING_MODE` in `src/lib/site-config.ts` | `published` |
| Advertising | `AD_MODE` in `src/lib/site-config.ts` | `off` |
| Approved advertisements | `src/lib/ads.js` | none |

Nothing has been raised and nothing is shown. The ledger on `/support` is edited
by hand, in date order, and rows are never removed (a correction is its own row).

## The rules are code

The rules printed on `/support` come from `src/lib/funding-policy.js`
(`AD_RULES`, `GIVING_TERMS`), so the page cannot drift from them. They are
enforced by `scripts/test-funding.mjs`, which runs in `npm test`:

- an advertisement may appear only on `/`, `/roadmap` and `/whats-new`; every other
  path, including any page that does not exist yet, is refused
- `AdSlot` may be imported only by those pages, and never by the base layout, a
  lesson, a quiz, Sky or the accessibility panel
- no advertising-network host appears in the source, and the content-security
  policy still allows scripts and images only from this site
- an entry in `ads.js` must pass `validateAd`: allowed category, https link with no
  tracking parameters, an image kept on this site, no AI wording, not a vendor or
  product the registry names, paid, dated, and approved by a named person
- no page or guide still says "no ads" or "no sponsorship, ever"

## Adding an advertisement

1. Read the rules on `/support`. A business that sells or is an AI product, or that
   a lesson names, is a no. So are the banned categories. Anyone who asks to see or
   change a lesson, tool card or comparison as part of the deal is a no.
2. Record what was agreed: who paid, how much, the dates.
3. Add the entry to `src/lib/ads.js` in a commit, with `approvedBy` and
   `approvedOn`. Put any image under `public/ads/`.
4. `npm test`. A rule that can be checked by a machine and is broken fails the
   build, and the message names the rule.
5. Add the row to the ledger on `/support` in the same change.
6. Only then set `AD_MODE` to `'on'`, and before that read `/privacy` and
   `/safeguarding` once more: they say none is shown, and they must say what is.

`AdSlot` shows nothing when advertising is off, when the page is not allowed, or
when no entry is current and valid. There is no empty box and no reserved space.

## Not settled by any of this

Lrnon is not a registered charity. Whether an unregistered initiative may receive
gifts, especially from abroad, how gifts and advertising income are taxed, and how
a payment is taken at all (today giving is arranged by email) are questions for an
accountant. If giving needs to pause while they are answered, set `FUNDING_MODE`
back to `partial`.
