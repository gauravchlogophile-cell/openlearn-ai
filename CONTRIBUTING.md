# Contributing

Four ladders — pick yours:

1. **Content:** fix a typo → improve a lesson → verify a registry card →
   author a lesson from the template. Start: `content/explorer/e1/` and the
   style guide in `docs/handbook/style-guide.md`. No coding knowledge needed.
2. **Translation:** opens with i18n activation (Sprint 17). Watch Discussions.
3. **Code:** `make dev`, then look for `good first issue`. Read
   `docs/handbook/` first — especially the page-weight and a11y budgets,
   which CI enforces.
4. **Verification/QA:** run the assistive-tech pass script, triage bug reports.

Rules that always apply:
- Sign off commits (DCO): `git commit -s`
- Content PRs must pass `make validate` (CI runs it too)
- Every lesson claim about a tool must interpolate from `/registry`, never be
  hard-coded — the linter rejects violations
- Be kind. See CODE_OF_CONDUCT.md.
