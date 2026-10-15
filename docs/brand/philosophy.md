# Lrnon brand philosophy

Founder prerogative, recorded 26 August 2026. This governs content, product and
communications, and is the reference for resolving any future conflict about
how Lrnon treats brands, vendors and sources.

## The position

**Lrnon is brand-neutral. It is not brand-silent.**

Those are different things, and conflating them has already caused one internal
inconsistency in this repository (see *History* below).

Lrnon teaches about AI. Doing that usefully requires naming the products people
actually encounter — assistants, image tools, automation platforms, open-weight
models. Naming a product is not endorsing it.

## What neutrality means here

**Nobody pays to be in a lesson.** No vendor pays for placement, ranking or
inclusion in a lesson, a tool card or a comparison. No affiliate arrangements, no
paid reviews. This is stated on the landing page and on `/about`, and is binding.
Until 15 October 2026 this read "No sponsorship, ever" and covered all money;
see *Funding* below for what changed and what did not.

**No favourite.** Lrnon does not tell a learner which product to use. It
describes what exists and teaches a method for deciding — E2·L2's own-benchmark
approach — because the right answer depends on the learner's language, budget,
jurisdiction and work, none of which we know.

**Sourced, and dated.** Descriptions are drawn from the vendor's own published
material, or from what the market has openly tried, tested and reported. Every
tool named in a lesson carries a link to the vendor's own source and the date it
was last checked.

**The vendor is the authority, not us.** Where our description and the vendor's
current documentation disagree, theirs is correct and ours is stale. The link is
provided so a reader can always reach the authority directly.

**Discretion is legitimate.** Being specific about a product — its strengths,
its limits, its price tier — is not favouritism. Withholding a measured
difference in the name of even-handedness is the *false balance* Lrnon's own
E7·L5 identifies as a failure. Neutrality means no unearned preference, not
refusing to say what is true.

## Funding

Lrnon was self-funded and promised no ads and no sponsorship of any kind. On
15 October 2026 the founder opened it to three kinds of money — donations (from
anyone, learners included), grants, and advertising — while keeping it free for
every learner, always.

The earlier promise was protecting four things. All four are kept, and the first
three are now enforced in code rather than promised:

1. **A learner never pays, and nothing a learner needs is behind money.** Lessons,
   practice, records, certificates and Sky. Giving unlocks nothing: no feature, no
   priority, no badge. Donors are not ranked. Nothing asks a learner for money
   inside a lesson, a quiz, a review or Sky (`test-sky-buddy.mjs`).
2. **Nobody can buy their way into the curriculum.** No paid placement, ranking or
   inclusion. An advertisement may not be for an AI product or for any vendor the
   lessons or registry name, which is checked against the registry
   (`src/lib/funding-policy.js`, `test-funding.mjs`).
3. **Learners are not tracked or profiled for money.** No advertising-network
   scripts, no cookies, no identifiers, no personalising. The content-security
   policy allows scripts only from this site, and a test fails if that changes.
4. **Learning is not interrupted.** Advertising is limited to three browsing pages
   and may never appear in a lesson, quiz, review, assessment, the accessibility
   panel, Sky, the community rooms, Ask Doubts, or any account, privacy,
   child-safety or support page. The check fails closed: a page nobody listed gets
   no ad slot.

**What this costs, stated plainly.** "No ads" was a sentence anyone could verify at
a glance. The new position is a set of rules, and a test can only check the ones a
machine can check. "Suitable for every age" and "honest" are a person's judgement,
which is why every advertisement is recorded in the public ledger and the
repository with who paid, how much, the dates and who approved it.

**The order of events.** The earlier statement said any change would be published
before it happened. It is published on `/support`, `/about`, `/privacy`,
`/safeguarding` and in these guides in the same change that opens giving. No
advertisement has been shown, none is approved, and there is no advertising network,
so nothing has yet happened that the page does not describe.

**What cannot be settled by a rule.** Lrnon is not a registered charity. Whether an
unregistered initiative may receive gifts, especially from abroad, and how gifts
and advertising income are taxed, are questions for an accountant, not for this
document.

## Engagement is for learning, not for return visits

Lrnon has streaks, levels, badges and a mascot, Sky, who is on every page. The
founder's instruction, recorded 15 October 2026, is that these exist to help
people learn and not to keep them on the site. Held as rules, each one tested in
`scripts/test-sky-buddy.mjs`:

- **Progress is earned by learning, never by opening anything.** XP, streaks and
  badges come from finishing a lesson, passing a quiz or doing a review. Sky
  displays them and never awards them, so there is nothing to farm.
- **Sky suggests one next step and says how long it takes.** It does not invent
  urgency, and it never talks about losing, missing or breaking anything. A gap is
  not a failure; the weekly view already says so.
- **No comparison between learners.** No leaderboard, because ranking learners
  exposes them to each other and is not a reason to learn.
- **No timers, no countdowns, no sound, no flashing.** Movement is one slow float,
  removed by the device's reduce-motion setting and by Lrnon's own switch.
- **Numbers can be switched off.** Anyone for whom a counter is pressure can hide
  streaks and levels from Sky.
- **It never asks for money.** Support has one page, linked from the footer.

Sky is also built for the people most easily excluded by a bright, animated
character: it follows the reader's light or dark theme, the high-contrast setting,
the dyslexia-friendly font, text size and line spacing, and reads aloud on request
with the device's own voice.

## Accountability and staleness

The AI field moves fast. Content is captured on a date from a source, and Lrnon
is not accountable for a vendor changing its product afterwards — provided the
source and the date are visible to the reader, which is what makes the
arrangement honest rather than a disclaimer.

That commitment is built into the architecture rather than promised:

| Mechanism | What it does |
|---|---|
| `lastVerified` on every registry card | the date the description was checked |
| **CUR-7** in `validate-content.mjs` | a card older than 120 days **fails the build** |
| `check-sources.mjs` | fetches each vendor's docs and reports drift |
| `RegistryCard.astro` | shows a staleness banner to the reader past 120 days |
| `LessonSources.astro` | renders source + date for every tool a lesson names, and for any outside source a lesson cites in `sources:` |
| Lesson age in `validate-content.mjs` | a lesson not re-read in 90 days warns, in 180 **fails the build** |
| `content-freshness.yml` | every Monday: watches vendor pages and cited sources, audits every lesson, and keeps one issue open until a person has looked. Never edits a lesson |

As Lrnon grows — time, people, funding — content validation and refresh remain a
first-order priority rather than a backlog item. The architecture above exists so
that commitment survives changes of staff and attention.

## The durable/volatile split

The operating rule that follows from all of the above:

- **Lessons teach mechanisms.** Tokenisation, diffusion, retrieval, verification.
  These do not change when a vendor ships a release, so lessons stay durable.
- **The registry carries volatile facts.** Product names, capabilities, tiers,
  free-tier terms, links. Dated, watched, and fails the build when stale.
- **A volatile fact placed in a lesson is a bug**, because nothing checks it
  there. Not because specificity is wrong — because it rots silently.

This is why lessons avoid model version numbers. It is an architectural rule
about *where facts live*, not a reluctance to be specific. Practitioner and
Builder content will and should name platforms, SDKs and modes; the discipline is
that the version-dependent half goes in a card that fails the build when it ages.

**Where a lesson asserts a limitation that could plausibly be solved**, it must
say when that was true and tell the reader to test it. E6·L5 and E10·L2 already
do this; it is the standard, not an exception.

## Trust is the product

Lrnon's only asset is that a learner believes what it says. Every rule above
exists to protect that, and it is why:

- there are no paywalls and no dark patterns, and any advertising is held to rules a test enforces;
- funding is published in the open;
- corrections are visible rather than quiet;
- content states what it does not know.

A single instance of undisclosed favouritism would cost more than any commercial
arrangement could pay. That is the whole calculation.

## History — the inconsistency this document resolves

Recorded because the reasoning matters more than the conclusion.

An audit noted approvingly that "no lesson anywhere names a model version". That
framing was wrong in two ways. It described version-neutrality while implying
brand-neutrality, when in fact 25 lessons name tools and 19 registry cards exist.
And it presented an architectural rule as a principled avoidance.

Worse, the audit found that only 8 of those 25 lessons surfaced a source link or
a date. The accountability the neutrality position depends on existed in data and
was invisible to readers. `LessonSources.astro` fixes that by construction: an
author cannot name a tool in frontmatter and forget to source it, because the
sourcing is no longer a thing they do.

## Keeping the brand guides true

The guides assert facts — module counts, whether certification exists, whether
the assistant is on, that rooms are closed. Those go stale the moment the
product moves, and a quietly-wrong brand guide is worse than none, because it is
the document that gets pasted into a funding application.

So brand claims get the same treatment as tool descriptions rather than a
promise to remember:

| | Content | Brand guides |
|---|---|---|
| Claim carries | `lastVerified` per registry card | `expect` value in `docs/brand/claims.json` |
| Drift detected by | `check-sources.mjs` watching vendor docs | `check-brand-claims.mjs` probing the repo |
| Staleness fails | build at 120 days (CUR-7) | `npm test` at 180 days per guide |

`scripts/check-brand-claims.mjs` runs in `npm test`. Each claim names the guide
and the sentence it lives in, so a failure reads as an instruction rather than a
puzzle:

> BRAND CLAIM DRIFTED — certification-not-built
> guides say: false · repo says: true
> where: guide 02, 03 — "designed, not built"
> do: the public statement must stop disclaiming it…

**When you change the product, the guides fail before anyone can quote them.**
That is the whole mechanism. Update the guide and `claims.json` together — the
pairing is what stops them drifting apart.

Claims that cannot be probed — "one maintainer", tone of voice, the trademark
position — are governed by the 180-day review interval instead. That is a weaker
guarantee, stated as one.
