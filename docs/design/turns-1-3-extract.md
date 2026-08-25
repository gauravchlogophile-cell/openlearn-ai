# Design turns 1–3 — recovered

These three artboards were unreadable for most of this project: the design file
is 406,710 characters and the DesignSync `get_file` method caps at 256 KiB, so
it returned turns 9→4 and silently truncated the rest. `WebFetch` on the design
URL returns 403.

Recovered by calling the design app's own RPC endpoint through an authenticated
browser session:

    POST https://claude.ai/design/anthropic.omelette.api.v1alpha.OmeletteService/GetFile
    content-type: application/json
    connect-protocol-version: 1
    { "projectId": "<uuid>", "path": "Lrnon Redesign.dc.html" }

The response is `{ content: <base64> }` with no size cap. Recorded here so the
next person does not repeat the search.

Turn offsets in the decoded file: 9@21441, 8@56678, 7@97159, 6@196784,
5@227686, 4@256515, **3@288133, 2@321289, 1@361128**.

---

## Turn 2 — "direction locked" (tokens + lesson page)

Confirms the token swap already implemented: Deep Indigo `#3d3d8f` kept, only
neutrals warmed, dark palette untouched.

### Lesson page composition — the significant one

A **two-column layout** we do not currently have:

- **Breadcrumb**: `Lrnon / Explorer · E1 · What Is AI, Really?`
- **Inline reading controls in the lesson header**: `A− A A+`, `◑ Theme`,
  and the streak chip — reachable without leaving the lesson.
- **Module sidebar**: `Module E1 · 8 lessons`, a `1/8` progress indicator, and
  the numbered lesson list with the current one marked.
- **Offline pack, three states in one slot**: `Make available offline` →
  `Saving… 42%` → `✓ Available offline / Remove`.
- Meta line: `Lesson 1 of 8 · 7 min read · last verified 7 Jul 2026`.
- Objectives marked with `✓`, not bullets.

## Turn 3 — landing page + accessibility

### Landing

- Eyebrow `Free forever · open source`, then the headline broken over three
  lines: `Learn AI. / Free. / Forever.`
- Reassurance row: `No ads · No paywalls · No dark patterns · No account needed`
- **"Try one question now"** — a real question answerable before signup:
  *"Your phone unlocks by recognising your face. Is that AI deciding, or AI
  suggesting?"* This is the single strongest idea in the turn: it proves the
  product before asking for anything.
- Stats row: review cards, `17 badges to earn`, `Free — now, and at every step
  after`.
- **Why is this free?** three cards — Published finances / Vendor-neutral /
  Content CC BY-SA 4.0.
- **Three tracks, one path**: Explorer `3 of 8 live` with ✓ per live module,
  Practitioner and Builder marked planned.
- Footer: Privacy · Terms · Accessibility statement · Finances.

### Accessibility panel

One header button opening a panel, rather than only a separate page:
text size, line spacing, reading width, high contrast, dyslexia-friendly font,
**read lessons aloud** (device voice), data-saver, reduce motion.

"Saved on this device. No account needed."

We ship these at `/reading`; the design wants them reachable from any page
without navigating away. **Read-aloud is not implemented** — it needs the Web
Speech API and is the one genuinely new capability here.

### Reward moment

Deliberately quiet: *"Module E1 complete — Eight lessons, +80 XP, and a new
badge. Your streak is at seven days."* No confetti, no noise.

## Turn 1 — original direction

Superseded by turn 2's locked direction; kept for provenance only.
