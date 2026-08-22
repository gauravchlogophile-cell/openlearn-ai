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
