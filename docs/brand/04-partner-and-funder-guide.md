# Brand guide 4 of 4 — Partner and funder guide

**Audience:** grant assessors, institutional partners, philanthropic funders,
prospective volunteers with resources to commit.
**Status:** every figure must be verifiable on request. Update before sending.

---

## In one paragraph

Lrnon is a free-for-learners, open-licensed curriculum teaching people to use AI
competently and safely. It covers the material vendor courses omit — verifying
output, cost mechanics, accessibility, working outside English, AI embedded in
software people did not choose, and high-stakes personal decisions. Nobody can pay
to be in a lesson, it publishes its sources with verification dates, and it
enforces content freshness in its build pipeline rather than promising it.

## The gap it fills — evidenced

The dominant free alternative, **Google AI Essentials, is five modules**:
Introduction to AI, Maximize Productivity, Prompting, Use AI Responsibly, Stay
Ahead. Lrnon's Explorer track is fourteen, and the additional nine cover
material with demonstrated public demand and no established free provision:

| Module | Evidence of demand |
|---|---|
| AI you did not choose | 1,000+ comment threads on AI features enabled by default |
| Health, money and legal | Very high-volume discussion; harm-reduction framing is absent elsewhere |
| Assistive use | Sustained demand in disability communities; near-zero coverage |
| What it actually costs | Ordinary users asking "what are tokens?"; bill-shock threads |
| Working in your own language | Long-running threads on quality gaps in non-English use |

Demand was researched before the content was written, and the research changed
it: one planned module was re-aimed after the evidence showed it addressed the
second-most-asked question rather than the first.

## Why the approach is credible

**Accessibility is built, not claimed.** Read-aloud, adjustable text size, line
spacing, reading width, high contrast, a dyslexia-friendly typeface, reduced
motion and a data-saver mode — plus a curriculum module teaching AI as an
assistive tool, which is close to absent from the field.

**Safeguarding precedes features.** Learner-to-learner spaces are built and
deliberately closed. Six of seven opening conditions are enforced in the
database — moderation before publication, no private messaging table at all,
no identifying profile fields, anonymous reporting, audited escalation,
enforced retention. The seventh is a named person, and no code substitutes.

**Quality is enforced mechanically.** Content lint, unit tests, typecheck and a
full database test suite on every change; tool descriptions fail the build at
120 days; every lesson requires answering questions to complete.

**Reach is designed for constraint.** Works on a 320px phone, offline, on a
metered data plan, with a screen reader.

**The companion is built to the same standard.** Sky, the study buddy, is on every
page and follows the reader's light or dark theme, high-contrast mode,
dyslexia-friendly font, text size and reduce-motion setting. It never flashes or
glows, can read aloud with the device's own voice, and its numbers can be switched
off.

## Governance and integrity

- Nobody pays to be in a lesson: no paid placement, ranking or inclusion, no
  affiliate revenue. Donations, grants and advertising are accepted under
  published rules, and none may touch the curriculum. Position published.
- Content CC BY-SA 4.0; code MIT. Nothing is locked in.
- Corrections published rather than made quietly.
- Learner progress is local-first; accounts optional; account deletion
  implemented.
- Under-18 learners: learning is open to all ages; volunteering below 18
  requires verifiable guardian consent, implemented in the schema.

## What funding would change

Stated honestly, because a funder who discovers the gaps later is a funder lost.

**Funding position, plainly.** Nothing has been raised. Until 15 October 2026
Lrnon was paid for by its founder alone and promised no advertising and no
sponsorship; it is now open to donations (from anyone, learners included, never
required and unlocking nothing), to grants, and to advertising under rules a test
enforces: three browsing pages only, never in a lesson, quiz, review, assessment or
Sky, no tracking, no advertising network, and no advertisement for an AI product or
any vendor the lessons cover. No advertisement is shown or approved. Lrnon is not a
registered charity, so how gifts and any advertising income are received and taxed
is an open question for an accountant, and one a funder should raise with us.

**Current constraints:** one maintainer. Certification is **built and not
issuing** — the schema, assessments, published rubric and public verification
all exist, and `certification_open()` refuses until two named reviewers are in
place and the guardian path has been tested with real families. Sky, the site
assistant, is **enabled for staff only** as of 4 September 2026, with a spend
cap enforced in the database rather than a promise. The Practitioner track is
complete at eleven modules; the Builder track has one module planned and none
published.

This paragraph was itself stale for a fortnight, saying certification was "not
built" and the assistant "switched off" after both had changed. It is the one
paragraph in these guides most likely to rot, because it is the one describing
things in motion — check it against the repo before sending, not against
memory.

**What resource unlocks, in order:**
1. **A second safeguarding-trained person** — the single blocker on community
   features, which are otherwise finished.
2. **Content maintenance capacity** — the 120-day freshness rule is enforced by
   the build; keeping ahead of it across a growing curriculum is a standing
   commitment, not a project.
3. **Native-speaker contributors** — genuine multilingual coverage requires
   people who write and check each language. Machine translation would
   contradict the curriculum's own teaching.
4. **Two named certification reviewers** — not infrastructure. The schema,
   assessment flow, rubric, issuance, revocation and public verification page
   are built; `certification_open()` refuses until two reviewers have agreed on
   twenty sample answers and the guardian-email path has been tested with real
   families. This item used to read "certification infrastructure — assessment,
   issuance, verification, revocation", which would have invited a funder to
   pay for work already done.

## What we will not do for funding

Accept money conditional on covering, ranking or recommending a product; show
an advertisement for an AI product or on a learning page; track or profile a
learner for money; paywall any part of the curriculum; or add engagement
mechanics designed to increase time on site rather than learning. That last one is
checked, not promised: Sky, the study buddy, awards nothing, has no timers or
leaderboard and never mentions losing a streak, and a test fails if that changes.

These are stated up front because they are more useful to a funder before a
conversation than after one.

## Verification

Everything above is checkable in the public repository — the curriculum, the
test suites, the safeguarding schema, the brand philosophy and the decision
record. Nothing in this document depends on taking our word for it, which is
the same standard the curriculum applies to everyone else.
