# Brand guide 1 of 4 — Internal operating guide

**Audience:** you, and every future contributor, volunteer or moderator.
**Status:** the working reference. Blunt on purpose.
**Governs:** how Lrnon responds when someone challenges its neutrality,
accuracy, funding or motives.

---

## The one sentence everything derives from

> **Trust is the product. Everything else is a feature.**

Lrnon has no moat, no network effect and no switching cost. A learner stays
because they believe what it says. One instance of undisclosed favouritism
would cost more than any commercial arrangement could pay. Every rule below is
downstream of that arithmetic.

## The three claims we make, and what backs each

Never make a claim we cannot point at a mechanism for.

| Claim | Mechanism that backs it |
|---|---|
| "No sponsorship, ever" | No commercial agreements exist. Stated on `/`, `/about`. |
| "Sourced and dated" | `LessonSources.astro` renders vendor link + `lastVerified` on every lesson naming a tool |
| "We keep it current" | CUR-7 fails the build at 120 days; `check-sources.mjs` watches vendor docs |

If a mechanism is ever removed, the claim comes down the same day.

---

## Conflict playbook

### A vendor asks for placement, sponsorship or a "partnership"

**Answer: no, and say why in one line.**

> "Thank you — Lrnon takes no sponsorship and no paid placement of any kind,
> so there is nothing we could offer. Your product is covered on its merits
> from your own published documentation. If anything in our description is
> inaccurate or out of date, tell us and we will correct it — that route is
> always open and always free."

Do not negotiate a smaller version. Do not accept free credits, review units,
event invitations or embargoed access in exchange for anything. Free access
that is **openly available to anybody** is fine; anything offered *because we
are Lrnon* is not.

**If they persist:** repeat once, then stop replying. Do not escalate publicly
unless they misrepresent us.

### A vendor objects to how we describe them

**Treat as a correction request, not an attack.** This is the good case.

1. Ask which specific sentence and what the accurate version is.
2. Check it against their own published documentation.
3. If they are right, correct it, update `lastVerified`, and publish it in
   `/whats-new`.
4. If we are right, say so plainly and cite the source and date.

Never quietly delete a correct-but-unflattering statement to end a
conversation. That is the exact failure the whole brand is built against.

### Someone accuses us of bias toward a product

**Respond with the mechanism, not with protest.**

> "Fair question. We take no sponsorship of any kind, and every tool named in
> a lesson shows the source we used and the date we checked it — so you can
> verify the description yourself rather than trusting us. Our position is on
> `/about`. If a specific passage reads as favouritism, point me at it and I
> will look at it today."

Then actually look at it. If it does read as favouritism, fix it.

**Do not say** "we are neutral" as though the word settles it. Neutrality is a
practice, and the reply should point at the practice.

### Someone says content is wrong or out of date

Thank them, check it, fix it, publish the correction in `/whats-new`.

**Corrections are published, never quiet.** A visible corrections record is the
only observable evidence that a source cares about accuracy — E7·L4 argues this
about other people's sources, and it applies to us first.

### "Why do you name specific products if you are neutral?"

> "Neutral, not silent. Teaching about AI without naming what people actually
> use would be useless. Naming a product is not endorsing it — we describe what
> exists, show our source, and teach a method for choosing, because the right
> tool depends on your language, budget and jurisdiction and we do not know
> those."

### Press or a funder asks how we are funded

Answer completely and immediately. `/support` states the position. If that
changes, it is published before it is true, not after.

### A learner reports something harmful or unsafe

Safeguarding first, brand second, always. `/safeguarding` has the route, urgent
reports hide content immediately, and rooms stay closed until a named owner and
deputy exist. **No brand consideration ever delays a safeguarding response.**

---

## What we never do

- Accept payment, equity, credits or perks for coverage.
- Rank tools by anything but stated, checkable criteria.
- Publish a capability claim without a date.
- Say "AI-powered" about ourselves as a selling point.
- Use urgency, streak guilt, or dark patterns to drive engagement.
- Claim a credential, accreditation or partnership we do not hold.
- Machine-translate the curriculum and call it multilingual (E10·L8).
- Quietly amend a claim that turned out to be wrong.

## Language: use / avoid

| Use | Avoid |
|---|---|
| "free, no ads, no paywalls" | "freemium", "unlock", "premium tier" |
| "we checked this on [date]" | "always up to date" |
| "we do not know yet" | manufactured certainty |
| "brand-neutral, not brand-silent" | "unbiased" (unprovable) |
| "teaches you to decide" | "the best AI tool" |
| "a person answers within two working days" | "24/7 support" |

## Escalation

One maintainer today. Until that changes:

- **Content correction** — fix and publish, no approval needed.
- **Anything touching neutrality, funding or a vendor relationship** — founder
  decides, and the decision is recorded in `docs/brand/`.
- **Safeguarding** — follow `/safeguarding`; it outranks everything here.

When there is a second person, this section is the first thing to rewrite.
