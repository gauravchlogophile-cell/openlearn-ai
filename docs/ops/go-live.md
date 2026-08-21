# GO-LIVE RUNBOOK
## From this zip to a live learning portal — ~30 minutes of your time

**What you'll have at the end of Part A:** the full platform live at
`https://<your-project>.pages.dev` (free, unlimited bandwidth), installable
as an app, working offline — everything learners need except accounts.
Part B (optional, later) adds sign-in and cross-device sync.
Part C adds a custom domain.

Everything below uses free tiers. Total unavoidable cost: **$0**
(a custom domain, if you want one, is ~$10–12/year).

---

## Part A — The site goes live (≈20 min)

### A1. Put the code on GitHub (≈10 min)
1. Create a GitHub account if needed → github.com.
2. Create a new repository: name it `openlearn-ai` (or your cleared name),
   **Public**, no README (we have one). 
3. On your computer, unzip the latest sprint zip, then in that folder:
   ```bash
   cd openlearn
   git init
   git add .
   git commit -s -m "chore: initial public release (Sprints 1-8)"
   git branch -M main
   git remote add origin https://github.com/<YOUR-USERNAME>/openlearn-ai.git
   git push -u origin main
   ```
   (`-s` is the DCO sign-off our CONTRIBUTING.md asks for.)
4. That's it — CI (lint, tests, build, weekly staleness check) activates
   automatically because the workflows are already in `.github/workflows/`.

### A2. Deploy on Cloudflare Pages (≈10 min)
1. Create a free account → dash.cloudflare.com.
2. **Workers & Pages → Create → Pages → Connect to Git** → authorize GitHub
   → pick your `openlearn-ai` repo.
3. Build settings:
   - Framework preset: **Astro**
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Environment variables → add `NODE_VERSION` = `22` (Wrangler, used for
     deploy, requires Node 22+)
4. Click **Save and Deploy**. First build takes ~2–3 minutes.
5. You now have `https://<project>.pages.dev` — open it. Every push to
   `main` redeploys automatically from now on.

### A3. Five-minute smoke test (do all of these on your phone)
- [ ] Landing loads fast; "Start learning — no signup" works
- [ ] Complete lesson E1·L1 → "+10 XP" appears; header chip shows 🔥/⭐
- [ ] `/roadmap` → toggle Map view → tap "Make available offline" on E1
- [ ] Turn on airplane mode → open an E1 lesson → it works; quiz works
- [ ] Airplane mode off → `/quiz/e1` → answer through → pass/retry flow OK
- [ ] `/review` → session runs, grades show interval previews
- [ ] Browser menu shows "Install app" / "Add to Home Screen"
- [ ] `/privacy`, `/terms`, `/404-anything` render properly

### A4. Tell the search engines (5 min, optional but wise)
- Google Search Console → add property → your URL → verify (DNS or HTML) →
  submit sitemap: `https://<your-url>/sitemap-index.xml`
- Bing Webmaster Tools → same (can import from Search Console).

---

## Part B — Accounts & sync, when you're ready (≈30 min, optional)

The site is fully useful without this; anonymous progress already works and
merges losslessly when accounts arrive (it's designed that way).

1. Create a free project → supabase.com → New project (pick a region near
   your learners; note the **database password** somewhere safe).
2. Apply our migrations. Easiest path — Supabase Dashboard → SQL Editor →
   paste the contents of `supabase/migrations/0001_identity.sql` → Run,
   then `0002_rewards.sql` → Run.
   (CLI alternative: `supabase link --project-ref <ref>` then `supabase db push`.)
3. Auth providers — Dashboard → Authentication → Providers:
   - **Email**: already on (magic links work immediately).
   - **Google**: create an OAuth client in Google Cloud Console → paste
     client ID/secret; authorized redirect URL is shown on the Supabase page.
   - **GitHub**: GitHub → Settings → Developer settings → OAuth Apps → same.
4. Connect the site — Cloudflare Pages → your project → Settings →
   Environment variables → add:
   - `PUBLIC_SUPABASE_URL` = (Supabase → Settings → API → Project URL)
   - `PUBLIC_SUPABASE_ANON_KEY` = (same page → anon public key)
   Then **Deployments → Retry deployment** so the build picks them up.
5. Verify: `/account` now shows sign-in buttons instead of the local-only
   note. Sign in → "Sync progress now" → your local XP appears server-side.
   Sign in on a second device → same progress. 🎉
6. Update `/privacy` before announcing accounts widely — the page itself
   tells you it changes when this feature does. (Edit
   `src/pages/privacy.astro`, push, done.)

**Security notes already handled for you:** RLS is on for every table; the
XP ledger accepts writes only through the `award()` function; the anon key
is safe to expose by design (that's what RLS is for). Never put the
`service_role` key anywhere client-side or in Pages env.

---

## Part C — Custom domain (≈10 min, optional)
1. Buy the domain (after the trademark check — see Phase 2 §1; Cloudflare
   Registrar sells at cost).
2. Pages project → Custom domains → add `yourdomain.org` (and `www`).
   If the domain is on Cloudflare, DNS is configured automatically; HTTPS
   is automatic either way.
3. Set env var `PUBLIC_SITE_URL=https://yourdomain.org` in Pages →
   redeploy (fixes sitemap/canonical URLs).
4. Re-submit the sitemap in Search Console under the new domain.

---

## What's deliberately NOT in this runbook yet
- **Live playground (Modes 2/3)** — needs the Worker proxy + provider
  choices; a later sprint. Canned mode already teaches without it.
- **Certificates** — need capstones + server-side item banks (Sprint 11 scope).
- **Forum/analytics** — GitHub Discussions can be enabled on the repo today
  with one click (Settings → Features → Discussions); privacy-safe
  analytics is a later, deliberate choice.

## If something breaks
- Build fails on Pages → check the build log; 95% of cases are the
  `NODE_VERSION=22` variable missing (Wrangler's deploy step needs Node 22+;
  the build step itself works fine on Node 20, so this can pass "Build" and
  only fail at "Deploy" if missed).
- Blank page but build succeeded → check browser console; if CSP-related,
  see `scripts/generate-headers.mjs` — the CSP is generated at build with
  hashes for Astro's inline bootstrap; a mismatch means the generator
  didn't run as the final build step.
- Rollback → Pages → Deployments → ⋯ on any previous build → "Rollback".
  Instant, free, and why static-first was the right call.

*Runbook version 1.0 · matches the Sprint 8 go-live build.*

---

# APPENDIX — What is actually running in production

Recorded 2026-08-22 after a full audit of the GitHub / Cloudflare / Supabase
chain. **This supersedes the Pages-based instructions above**, which describe
the originally-planned path rather than the one that was built.

## Topology

| Layer | Reality |
|---|---|
| Repo | `gauravchlogophile-cell/openlearn-ai`, branch `main` |
| Host | Cloudflare **Workers** (not Pages) — Worker `openlearn-ai` |
| Account | `eeaebb2534d7be74d9dedee10aa8b751` |
| Live URL | **https://lrnon.org** |
| Also routes | `openlearn-ai.gaurav-ch-logophile.workers.dev` |
| Database | Supabase `ertmoznjrjrveidnhonj` (region ap-southeast-2) |

Because this is a Worker, `wrangler.jsonc` is authoritative: `main` points at
`dist/_worker.js/index.js`, assets are served from `dist`, and the `SESSION` KV
namespace must stay bound or sign-in breaks at runtime.

## `openlearn-ai.pages.dev` is NOT ours

That hostname serves an unrelated React SPA owned by someone else. It was the
old fallback value of `site` in `astro.config.mjs`, which meant any build
without `PUBLIC_SITE_URL` stamped a stranger's domain into our canonical tags
and sitemap. The fallback is now `https://lrnon.org`. Do not "restore" it.

## Build variables (Workers Builds → Settings → Build)

    NODE_VERSION            22
    PUBLIC_SITE_URL         https://lrnon.org
    PUBLIC_SUPABASE_URL     https://ertmoznjrjrveidnhonj.supabase.co
    PUBLIC_SUPABASE_ANON_KEY  <anon key — publishable, safe in the bundle>

Build command `npm run build`, deploy command `npx wrangler deploy`, root `/`.

## www

`www.lrnon.org` is a proxied DNS record plus a **Redirect Rule** issuing a
301 to the apex, preserving path and query string. Registering the domain did
*not* create `www` — it had to be added, and while the DNS record existed
without the redirect rule the hostname returned **522** (proxied, no origin).
Do not add `www` as a Worker custom domain; that would serve the site on both
hostnames and split SEO signals.

## Verifying a deploy matches git

Astro content-hashes its bundles, so this is exact:

    PUBLIC_SITE_URL=https://lrnon.org \
    PUBLIC_SUPABASE_URL=https://ertmoznjrjrveidnhonj.supabase.co \
    PUBLIC_SUPABASE_ANON_KEY=<key> npm run build
    curl -s https://lrnon.org/ | grep -oE '/_astro/[A-Za-z0-9._-]+' | sort -u

Every hash should exist in `dist/_astro/`. Comparing whole HTML files will
always show one difference — Astro's `astro-island uid` is random per build.
That single attribute differing is expected; anything else is real drift.

## Auth reality check

The app uses **only** `signInWithOAuth` (Google) and `signInWithOtp` (email
magic link) — see `src/components/AccountPanel.tsx`. There is no password
path anywhere. The Supabase advisor warning about leaked-password protection
is therefore not applicable, and it is a Pro-plan feature while the org is on
`free`. Do not upgrade for it.
