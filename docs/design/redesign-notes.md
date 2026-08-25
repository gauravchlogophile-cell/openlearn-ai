# Redesign notes — what is deliberately left open

The current visual layer is intentionally plain: it was built to prove the
learning mechanics, not to be the finished look. A redesign is expected. This
file records the seams left open for it, and the few rules a redesign must not
break.

## Left open on purpose

### The logo
Not yet designed. The wordmark is a single element in `src/layouts/Base.astro`:

```html
<a href="/" translate="no" class="notranslate" aria-label="Lrnon — home">Lrnon</a>
```

Swapping the text for a mark is a one-line change. Keep `translate="no"`, and
keep an `aria-label` on whatever replaces it — an `<img>` or inline `<svg>`
needs the accessible name the text currently provides.

The brand string is `Lrnon`. Style it however you like — all-caps, custom type,
letterspaced — with CSS. Do not change the string to do it.

### A light/dark toggle
Dark mode currently follows the operating system via
`@media (prefers-color-scheme: dark)` in `src/styles/tokens.css`. The rule is
written as:

```css
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { … }
}
```

so an explicit `data-theme` on `<html>` already wins in both directions. Adding
a toggle therefore needs only a control plus persistence — no CSS changes.

Two things a toggle must handle, and they are easier to design in than to bolt
on:
- **Flash of wrong theme.** The stored preference has to be applied before
  first paint, which means a small inline script in `<head>`, not a React
  island. Note the CSP: `scripts/generate-headers.mjs` hashes inline scripts at
  build time, so a new inline script is allowed automatically — but only if the
  generator still runs as the final build step.
- **Three states, not two.** light / dark / follow-system. A two-state toggle
  strands anyone who wants to follow the OS.

### Module and lesson index pages
`/roadmap` shows the skill tree; `/home` is the dashboard. There is no
per-module index — the previous-lesson fallback on the first lesson of a module
points at `/roadmap` for that reason. A redesign that adds module pages should
retarget that fallback.

## Rules a redesign must not break

### Do not rename lesson files
`lesson_progress` is keyed by `(user_id, lesson_slug)`, where the slug is the
content path. Renaming an `.mdx` file orphans the completed-lesson record of
every learner who has done it. Change the `title` in frontmatter freely; leave
the filename alone. (E2's `l8-notebooklm-…` keeps its name for exactly this
reason, though its title now reads "Gemini Notebook".)

### Keep the token layer
Every colour, space, radius and font size comes from a custom property in
`src/styles/tokens.css`. This is why dark mode was a ten-line fix rather than a
rewrite: nothing hard-codes a colour.

A redesign should replace the *values* of those tokens, and add tokens where it
needs them. It should not start writing literal hex codes into components. If
the new design needs a colour that is not a token, add the token.

### Keep tool facts in the registry
Lessons never hard-code facts about third-party tools (CUR-3, enforced by the
linter). They embed `<RegistryCard id="…" />`. A redesign restyles that
component; it must not inline the facts into lesson bodies, or the staleness
machinery stops protecting them. See `docs/handbook/verifying-registry-cards.md`.

### Keep the accessibility floor
Current state, which is the floor and not the ceiling: a skip link, visible
focus rings via `:focus-visible`, `aria-label` on every landmark and icon-only
control, `prefers-reduced-motion` honoured, and AA-verified colour pairings in
both themes. Re-verify contrast against any new palette — in **both** themes.

### Bump SHELL_V when the shell changes
`public/sw.js` precaches the app shell (`/`, `/home`, `/roadmap`,
`/achievements`, `/account`, `/offline`). Returning visitors keep serving the
cached copy until `SHELL_V` changes. Any redesign of the header, footer or
those pages needs the bump, or existing installs will show the old design.
Currently `ol-shell-v3`.

## Local preview

```bash
npx astro dev --port 4321 --host
```

`--host` matters on Windows: without it Astro binds to `[::1]` only and
`127.0.0.1:4321` refuses the connection.

---

## Appendix B — full frame audit (all 9 turns)

Every frame in `Lrnon Redesign.dc.html` was enumerated and checked against the
built site. The file is 406,710 characters; the DesignSync MCP caps `get_file`
at 256 KiB, so the inventory was taken through the design app's own RPC —
`POST /design/anthropic.omelette.api.v1alpha.OmeletteService/GetFile` with
`{projectId, path}` and header `connect-protocol-version: 1`, which returns the
whole file base64-encoded. `docs/design/turns-1-3-extract.md` records the
method; this is the frame list it yields.

Fifteen frames exist. They are the complete design surface:

| Turn | Frame | Route | State |
|---|---|---|---|
| 2 | Lesson page — the screen learners live in | `/learn/*` | built |
| 3 | Landing page — light default | `/` | built |
| 3 | Accessibility panel — one button, everything inside | header | built |
| 3 | Reward moment — no confetti, no noise | quiz result | built |
| 3 | Same landing page — phone, tablet, TV | `/` | verified 375 / 768 / 1920 |
| 4 | Funding page | `/support` | built, hidden by `FUNDING_MODE` |
| 5 | Site footer — appears on every page | all | built |
| 5 | Feedback & complaints | `/feedback` | built |
| 5 | Spread the word | `/share` | built |
| 6 | Volunteer page | `/volunteer` | built |
| 7 | Home — daily board & usage | `/home` | built |
| 7 | Ask Doubts — content questions only | `/doubts` | built, gate shut |
| 7 | Members & topic rooms | `/members` | built, gate shut |
| 7 | What's new — content changes | `/whats-new` | built |
| 7 | Community & More | `/community` | built |
| 8 | Dock button & opening state | all | built, `SKY_MODE=off` |
| 8 | Three conversation states | panel | built |
| 9 | Super Admin console | `/admin` | built |

The turn 7 header is drawn on every signed-in frame and is a frame-level
element in its own right: `Home · Learn · Doubts · Community · Members ·
What's new · More · ⌕ Search this page (/) · ◍ Accessibility · qf quiet-fern ▾`.

### What the audit found that was NOT a missing component

Two defects surfaced only because a design element was finally built against
them, which is the argument for building the design rather than approximating
it:

1. **Handles were never generated.** `0007`'s comment on `posts.author_handle`
   states handles are "generated, never chosen, so a child cannot publish
   their own name by putting it in a handle". Nothing enforced that:
   `handle_new_user()` inserted a NULL handle and the `profiles: update own`
   policy accepted anything matching `^[a-z0-9_]{3,24}$` — `sarah_smith_11`
   included. It went unnoticed because no page had ever displayed a handle.
   The board is the first surface that does. `0008` generates handles, locks
   them behind a trigger (RLS `WITH CHECK` cannot see the old row, so it
   cannot tell a rename from a timezone change), and backfills the two
   existing profiles. Verified against production by impersonating a learner:
   the rename raises, ordinary updates still succeed.

2. **Every page scrolled sideways on a phone.** The header `nav` was
   `display:flex` with no `flex-wrap`, measuring 524px inside a 422px
   viewport. Fixed with the turn 7 nav rebuild; now 375/375 with zero
   overflowing elements.

### Known deviations from the drawing, and why

- **The sample board is not seeded.** The mock lists five learners because a
  mock must show something. Shipping invented names would be a fabrication.
- **`+110 XP`, not `+80`.** Eighty is eight lessons at ten XP, so the mock's
  reward fires on the eighth lesson; ours fires when the module finishes,
  which includes the quiz's thirty.
- **Board columns read "N lessons · M reviews", not "· 38 cards".** Per-day
  card counts are local-only (`ol.reviewlog.v1`) and never sync, so the server
  cannot know them. Showing a number the database does not have would be
  worse than showing a different true one.
- **The avatar menu's contents are inferred.** The design draws the chip and
  the `▾` but never draws the menu open. It holds only pages that already
  exist.
- **Search searches the current page**, which is what the design labels it
  ("Search this page"). There is no site-wide index yet, and a box that said
  "Search" while matching one page would be a lie.
