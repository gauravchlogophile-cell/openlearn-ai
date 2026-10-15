# Content freshness

Lrnon shows learners a "checked" date. This is how that date stays true.

## What runs, and when

Every **Monday 06:00 UTC** the `Content freshness` workflow runs. It can also be
started by hand from the Actions tab.

| Step | Script | Looks for |
|---|---|---|
| Lint dates | `validate-content.mjs` | Tool cards past 90 days (warn) / 120 (fail). **Lessons** past 90 days (warn) / 180 (fail). |
| Watch sources | `check-sources.mjs` | A vendor page — or a source a lesson cites — whose wording changed since the last baseline. Reports pages it cannot read, and pages too thin to trust. |
| Audit lessons | `audit-content.mjs` | Lessons naming a tool but not declaring it in `tools:`; laws named with no `sources:`; broken external links; every sentence that states a model version, price, limit, year, statistic, law or "new feature". |
| Review packet | `propose-updates.mjs` | For the flagged lessons: the sentences to check and the pages to check them against. |

The result is **one issue**, titled *Weekly content freshness*. It is refreshed in
place every week and closed when nothing needs a person. (The two workflows this
replaced each opened an issue only if none was open, so a single forgotten issue
silenced the check.)

You can run the same checks any time:

```bash
npm run audit                        # writes content-audit.md and content-audit.json
node scripts/check-sources.mjs       # source-report.md
OL_TODAY=2027-01-20 npm run validate # what the linter will say on a future date
```

## What it deliberately does not do

**It never edits a lesson.** A changed page means a person should look. This is
the position the curriculum itself teaches (P11: automation proposes, a person
decides), and a lesson that a machine rewrote overnight would carry a "checked"
date nobody had earned.

If the repository has a `GEMINI_API_KEY` Actions secret, the packet also contains
**draft verdicts**. A verdict is shown only when the model quoted at least 25
characters that appear verbatim in the fetched page (`evidenceIsOnPage`, pinned
by `scripts/test-propose-updates.mjs`). It is still labelled UNREVIEWED. Without
the secret the job runs fine and lists evidence only.

## Working through the issue

1. Open the lesson. Read each flagged sentence against the page named under it.
2. Change what is wrong. Prefer wording that will not rot ("a smaller or earlier
   model than the vendor's best") over a name or a number.
3. Set `lastVerified` to the day **you** checked — not the day the file was
   generated. Never bump it without reading the lesson.
4. If the lesson states a fact about a law or a vendor's terms, add or refresh
   its `sources:` entry (below).
5. Run the **Content freshness** workflow by hand from the Actions tab with
   *accept_baseline* ticked. It records the pages as they read from the CI runner
   and commits `registry/_fingerprints.json`. Until then the same change is
   reported again every Monday. (Do not run `--update` on your own machine: the
   same page can read differently from another country, and the weekly comparison
   would then report geography as change.)

## `sources:` — outside facts

`tools:` sources a lesson's *products* from the registry. For a fact that is not
about a product — what a law requires, what a provider's terms say — add:

```yaml
sources:
  - label: "Google: Gemini API Additional Terms of Service (last updated 28 April 2026)"
    url: "https://ai.google.dev/gemini-api/terms"
    retrieved: "2026-10-15"
    kind: official        # or: secondary — a summary, not the official text
```

It appears under the lesson with the date it was read, turns amber after 120
days, and the URL is watched weekly like a registry card. **List only a source
you actually read.** A citation you did not open is a claim about yourself.

## Thresholds, and why they differ

| Thing | Warn | Fail | Why |
|---|---|---|---|
| Tool card | 90 d | 120 d | Describes a product that changes monthly. |
| Lesson | 90 d | 180 d | Teaches judgement, which ages slower — but nobody is vouching for one unread for six months. |
| `sources:` entry | — | shown amber at 120 d | A law or terms page can move without any of our files changing. |

## Known limits

- A page that is mostly script (Midjourney's updates site) cannot be watched; the
  report says so rather than staying quiet. Check it by hand.
- Some vendors refuse scripted requests (Canva). They are listed under *Could not
  check* every week until a person opens them in a browser.
- The volatile-phrase scan is a pattern match. It will miss a stale claim phrased
  in a way it does not know, and flag some phrases that are fine. It is a prompt
  to read, not a verdict.
