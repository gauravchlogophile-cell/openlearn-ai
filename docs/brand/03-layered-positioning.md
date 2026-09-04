# Brand guide 3 of 4 — Layered positioning

**Audience:** anyone writing about Lrnon in a longer form — a site page, a
deck, a press response, an application.
**Status:** public-safe in Part A. **Part B is internal and must never be
pasted into published copy.**

---

# PART A — public

## The problem

Most people now use AI daily and almost nobody was taught how. The free
material that exists is largely vendor-produced, teaches the tool rather than
the judgement, and stops exactly where the difficult questions start — what to
do when it is confidently wrong, when the cost is unclear, when it is embedded
in software you did not choose, or when the stakes are your health or your
money.

## The position

Lrnon teaches judgement, not tools. It names real products because avoiding
them would make the teaching abstract — and shows the source and date for every
description so a reader can check rather than trust.

## What makes it different

**It teaches the parts other courses stop before.** Verification, cost
mechanics, accessibility, working in a language other than English, AI you
never chose to use, and where not to use it at all.

**It is honest by construction.** Staleness fails the build. Corrections are
published. Community features stay shut until they can be supervised.

**It is free in a way that survives scrutiny.** No ads, no paywall, no
affiliate revenue, no sponsorship. The funding position is published.

## Who it is for

Anyone who uses AI and was never taught how — which is most people. It assumes
no technical background, works on a phone, and does not require an account.

---

# PART B — internal only

**Do not publish this section. It is candid so that Part A can be accurate.**

## What we are deliberately not saying yet

- **Certification is built and switched off.** This changed on 26 August 2026;
  the previous line here read "designed, not built" and the build-time check
  fired the day it stopped being true, which is what it is for.

  What exists: the schema, the assessment flow, the published rubric, the
  issuance and revocation paths, and the public verification page — which
  answers today and can never be switched off while certificates exist in the
  wild. What does not: any way for a learner to obtain one.
  `certification_open()` is conjunctive and refuses without two named reviewers
  who have agreed on twenty sample answers, plus a guardian-email path tested
  with real families. Neither is a flag anyone can flip.

  Never imply a certificate is obtainable. If asked directly: "built, and
  switched off until we have reviewers." Do not demo an issued certificate —
  none exists, and a mock-up shown to a funder becomes a screenshot we cannot
  retract. The verification page IS demonstrable and is the honest thing to
  show, including the fact that every code currently returns "no record".
- **Sky is enabled for STAFF ONLY**, as of 4 September 2026. Not for learners,
  not for the public, and not something to describe as launched. It is at this
  stage for one reason: gates 1 and 3 — 200 reviewed questions and a
  wrong-answer rate under 2% — cannot be measured without it answering, and
  neither has been measured yet.

  Demoing it is now defensible where it was not before, with two conditions.
  Say plainly that no learner can reach it. And do not offer an answer as
  evidence of quality until the review has happened: one good answer proves
  nothing, which is the entire reason the gate counts two hundred.

  The rate-limiter concern that used to sit here is resolved, though not the
  way it was written. The KV limiter was never replaced by a Durable Object;
  the spend ceiling moved into Postgres instead, where the check and the
  increment happen in one statement under a row lock, and KV was left doing
  per-IP traffic shaping. That is the stronger fix, and worth stating
  accurately rather than letting the old sentence stand.
- **One maintainer.** Say "a small team" only if it stops being one person.
- **Practitioner and Builder are incomplete.** P1, P2 and P3 exist; P4–P11 and
  B1 are planned. The roadmap shows this honestly and marketing copy must match
  it. This sentence had already gone stale once — it still said "P1 exists"
  after P2 shipped, because claims.json was updated and the guide was not. The
  staleness check reads the repo and compares it against claims.json, so it
  catches a wrong NUMBER but not a guide that disagrees with its own claim
  record. Update both.

## Known vulnerabilities to prepare for

**"Your content is AI-written."** It substantially is. The honest answer: it is
written with AI assistance and reviewed by a person, every factual claim carries
a source and a date, and the site's own E8·L2 sets the disclosure standard we
hold ourselves to. Do not deny it and do not volunteer it as a headline.

**"You name products, so you are not neutral."** Part A answers this; the
mechanism answer is in guide 1.

**"The name is close to other marks."** A trademark screening rated
LRNON medium–high risk against LRNGO, LRN and LearnOn. Get clearance advice
before the name goes on any certificate or registration. Do not discuss risk
publicly.

**"Content could be out of date."** Some will be. Point at the 120-day build
failure and the visible check dates — the answer is the mechanism, not a
promise.

## Claims that require a lawyer before use

Any use of "accredited", "certified", "partner", "official", or a comparison
naming a competitor unfavourably.
