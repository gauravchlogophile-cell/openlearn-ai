# Verifying registry cards

Registry cards carry dated claims about third-party tools. They rot. The lint
warns at 90 days and **fails the build at 120** (CUR-7), so verification is a
routine chore, not an emergency — provided you do it in the warning window.

A weekly workflow files an issue once cards pass 90 days. Fix it then.

## What "verified" means

Not "the link still 200s". Check, in order:

1. **Does the product still exist under that name?** This is the one that
   catches real breakage. Google renamed NotebookLM to Gemini Notebook in July
   2026, nine days after a verification pass — the card kept a dead
   `support.google.com/notebooklm` URL and the old name for six weeks.
2. **Does `docsUrl` resolve to documentation for *this* product?** A 301 into a
   generic marketing page counts as rot.
3. **Are the `capabilities` flags still right?** The most commonly wrong field.
   Vendors ship modalities constantly. Claude's card said `voice: false` long
   after voice mode shipped on every plan.
4. **Is `summary` still true?** Keep it free of prices and hard limits — those
   are guaranteed to rot. Say "limits change over time; check the official
   site" instead.
5. Only then set `lastVerified` to today's date.

## Renames: change `name`, never `id`

`id` is a stable key. Lesson frontmatter (`tools: ["notebooklm"]`) and
`<RegistryCard id="notebooklm" />` both reference it, and the content linter
enforces that every `tools:` entry resolves (CUR-3).

When a product is renamed, change **`name`** and mention the old name once in
`summary` so learners searching for it still recognise the tool. Leave `id`
alone. It is an internal key; nobody sees it.

**The same rule applies harder to lesson slugs.** `lesson_progress` is keyed by
`(user_id, lesson_slug)`, so renaming an `.mdx` file orphans the progress of
everyone who completed that lesson. E2's NotebookLM lesson is still filed at
`l8-notebooklm-source-grounded-tools.mdx` for exactly this reason, even though
its title now reads "Gemini Notebook". Rename the title, keep the file.

## Checking the links quickly

```bash
node -e "const fs=require('fs');for(const f of fs.readdirSync('registry').filter(x=>x.endsWith('.json')&&x!=='_schema.json')){const c=JSON.parse(fs.readFileSync('registry/'+f,'utf8'));console.log(c.id+' '+c.docsUrl)}" > /tmp/urls.txt
while read id url; do printf "  %-18s " "$id"; curl -4 -sIL --max-time 25 -A "Mozilla/5.0" -o /dev/null -w "%{http_code}\n" "$url"; done < /tmp/urls.txt
```

Two false alarms to expect:

- **Meta AI returns 403** and **Google properties sometimes 302 into an OAuth
  URL.** Both are bot protection, not rot. Open them in a real browser before
  changing anything.
- A 200 proves the host answered, not that the page is still about the product.
  Skim anything you are about to re-date.

## Checking the dates

```bash
OL_TODAY=2026-12-01 node scripts/validate-content.mjs
```

`OL_TODAY` lets you see what the linter will say on a future date, which is how
you confirm a verification pass actually bought you another 90 days.
