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

**It is free in a way that survives scrutiny.** A learner never pays and nothing
is behind money. Nobody can pay to be in a lesson, and there is no affiliate
revenue. Lrnon takes donations, grants and, under published rules that a test
enforces, advertising. The funding position is published.

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
- **The question-answering part of Sky is enabled for STAFF ONLY**, as of 4
  September 2026. Not for learners, not for the public, and not something to
  describe as launched.

  Do not confuse it with the study buddy. Since 15 October 2026 Sky is also the
  friendly character on every page, for everyone: it greets, suggests one next
  step with how long it takes, and shows the learner's own progress. It answers
  nothing, costs nothing, sends nothing anywhere, awards nothing and asks for
  nothing. Describe the two separately, and never let the visible character imply
  that the assistant is open to learners. It is not. It is at this
  stage for one reason: gates 1 and 3 — 200 reviewed questions and a
  wrong-answer rate under 2% — cannot be measured without it answering, and
  neither has been measured yet.

  Since 5 September those two gates are measured rather than asserted. They
  were a hard-coded array with both permanently false, which meant they could
  not become true however much review happened — a gate that cannot change is
  a decoration, and since "Everyone" is locked behind it the lock was
  decorative too. /admin/sky now counts staff verdicts recorded against real
  answers. The count is still near zero; the difference is that it can move.

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

  **Before Sky widens beyond staff, three things must be true; one is done.**
  (1) The model-provider plan and its current data terms are confirmed and dated.
  The assistant's footer used to say "Nothing you type is used to train
  anything", which could not be known: the quota behaviour is consistent with a
  free tier, and the provider's published terms for unpaid use say content may be
  used to improve its products and read by human reviewers. The footer was
  changed on 15 October 2026 to say only what holds on any plan, and a training
  claim should return only after the plan is checked. (2) `/privacy` says
  that questions go to an outside provider and that the provider's terms differ by
  plan. This was done on 15 October 2026, in words that admit the plan is
  unconfirmed, and should be replaced by the fact once (1) is settled. (3) The four gates and the "second owner" approval are enforced in
  `set_sky_mode`, which today checks only that the caller is the owner; they exist
  in the console and nowhere else. Certification and the rooms already enforce
  their conditions in the database and are the pattern to copy.
- **Funding changed on 15 October 2026, and nothing has been raised.** Lrnon is
  open to donations (learners included, never required), grants and advertising
  under published rules. No donation has been received, no advertisement is shown
  or approved, and there is no advertising network. Lrnon is not a registered
  charity. Say all of that before being asked.

  Never write or say "ad-free" or "no ads": it stopped being a promise on that
  date, and a funder who finds an old line quoting it will assume the worst. Say
  "free for every learner, nothing behind money, and nobody can pay to be in a
  lesson" instead. Do not describe advertising as a revenue plan; nothing exists to
  support that claim.
- **One maintainer.** Say "a small team" only if it stops being one person.
- **The Practitioner track is complete; Builder is not.** All eleven Practitioner
  modules, P1 to P11, exist. The Builder track has one module, B1, planned and
  none published. The roadmap shows this honestly and marketing copy must match
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
failure for tool cards, the 180-day one for lessons, the visible check dates and
the weekly freshness issue — the answer is the mechanism, not a promise.

**"You said no ads, and now you are open to ads."** True, and it was published
the day it changed. The answer is what the promise was protecting and how each part
is still held: learners never pay; nobody can buy a place in a lesson (no AI
vendors may advertise, checked against the registry); nobody is tracked for money
(no network scripts, enforced by the content policy); and nothing interrupts
learning (a few browsing pages only, failing closed). Do not say the old promise
was unrealistic. It was kept for as long as it was Lrnon's to keep.

**"A cartoon robot is a way to get children hooked."** Fair to ask. Sky awards
nothing, so there is nothing to chase; it never talks about losing a streak; it
has no leaderboard, timer, sound or flashing; and numbers can be hidden. Each of
those is a test, not a statement.

## Claims that require a lawyer before use

Any use of "accredited", "certified", "partner", "official", or a comparison
naming a competitor unfavourably.
