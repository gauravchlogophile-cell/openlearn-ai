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

**No sponsorship, ever.** No vendor pays for placement, ranking or inclusion.
No affiliate arrangements. This is stated on the landing page and is binding.

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
| `LessonSources.astro` | renders source + date for every tool a lesson names |

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

- there are no ads, no paywalls and no dark patterns;
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
