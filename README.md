# Learn On

**Learn AI. Free. Forever.** An open-source, vendor-neutral, gamified AI learning
platform — from absolute beginner to builder. No paywalls, no ads, no dark patterns.

> Status: **live at [lrnon.org](https://lrnon.org)** — daily spaced-repetition review
> (/review): SM-2 scheduler, cards unlock with completed lessons, interval
> previews on every grade, +5 XP once per day feeding streaks; 17 badges;
> module quizzes (E1–E3 banks, 80% pass); Prompt Sandbox (canned mode);
> **E1–E3 complete (26 lessons, 65 flashcards)**; 15-card registry with
> staleness CI; PWA + offline packs; skill-tree map; dashboard; anonymous
> progress; accounts and cross-device sync.
> See `/docs` for ADRs, the content handbook and the ops runbook.

### A note on the name

This project was drafted as "OpenLearn AI" and renamed to **Learn On**.
[OpenLearn](https://www.open.edu/openlearn/) is The Open University's
free-courses platform, running since 2006 — the same sector, the same
Creative Commons licensing, the same promise. That is a collision, not a
coincidence, and the original README carried "pending trademark clearance"
for exactly this reason. Renaming at 26 lessons was cheap; renaming later
would not have been.

Some infrastructure still carries the old identifier — the Cloudflare Worker,
the GitHub repository and the Supabase project. That is deliberate: those
names are never shown to a learner, and renaming the Worker would mean
migrating the custom domain and KV binding, with real downtime for no
user-visible gain.

## Deploy it (30 minutes, $0)

The complete path from this repo to a live URL — GitHub → Cloudflare Pages
→ optional Supabase accounts — is in **[docs/ops/go-live.md](docs/ops/go-live.md)**.

## Quick start

```bash
make dev        # install deps + start the Astro dev server
make validate   # run the content linter against /content and /registry
make build      # production build (static output)
```

Requires Node 20+. Database work additionally requires the Supabase CLI
(`supabase start`) — see `docs/handbook/setup.md`.

## Repository layout

```
content/    Lessons (MDX) — the open curriculum (CC BY-SA 4.0)
registry/   AI tool registry cards (JSON, schema-validated)
src/        Astro site (design tokens, layouts, lesson player, islands)
supabase/   SQL migrations (RLS-first), pgTAP tests
scripts/    Content validation & manifest generation
docs/       ADRs, handbook, ops runbooks
```

## Principles (binding)

Free means free · learner sovereignty · vendor neutrality · radical openness ·
learning by doing · honesty about AI · accessibility · freshness as a feature.

Licences: code MIT (`LICENSE`), content CC BY-SA 4.0 (`LICENSE-content.md`).
