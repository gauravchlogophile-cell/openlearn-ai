# Translation workflow

Decided by the owner on 16 October 2026: the Wave 1 languages in `languages-proposal.md`
are approved for building, and **nothing machine-translated goes live until a person has read
it.** This file is how that is enforced and how a reviewer works.

## The rule, in code

`src/i18n/locales.js` has one function, `liveStatus()`. A translation is shown to a learner
only if all four hold: its `status` is `reviewed`, `reviewedBy` names a person,
`reviewedOn` is a date, and `sourceHash` still matches the English it was made from.
Everything else is a draft: kept in the repository, never built into a page.
`scripts/test-i18n.mjs` tests the rule; `scripts/validate-i18n.mjs` fails the build on a
translation that claims to be reviewed without being signed.

Because of the hash, a translation cannot go stale silently. If the English lesson changes
(the verified date and contributors lines excepted), the translation comes off the site at the
next build and shows as "out of date" on `/admin/translations` until it is checked again.

## Where things live

| What | Where |
|---|---|
| English lessons | `content/<track>/<module>/<lesson>.mdx` |
| A translated lesson | `content-i18n/<lang>/<track>/<module>/<lesson>.mdx` (same file name) |
| Menus, footer, buttons | `src/i18n/ui/<lang>.json`, keys from `src/i18n/ui/en.json` |
| Languages and their scripts | `src/i18n/locales.js` |
| Status, for the desk | `public/i18n/status.json` (written by the build, counts and file names only) |

A translated lesson carries only the words: title, description, minutes, objectives,
flashcards and body. Track, module, order, the tools named, the sources and the verified date
are read from the English lesson. The translated page is `/<lang>/learn/<same slug>`.

## Making a draft

1. Copy the English file into `content-i18n/<lang>/...`, same path.
2. Translate the words. Keep tool names, product names, commands, code, numbers, dates and
   URLs exactly. Keep `import Quiz ...` and every `<Quiz ... />` block, with the same number of
   questions and the same `answer:` numbers (a reordered option moves the right answer).
3. Set the frontmatter: `lang`, `translationOf: "<english id>"`, `status: draft`,
   `machineDraft: true` (if a machine wrote it).
4. `node scripts/build-i18n.mjs stamp <file>` records which English it was made from.
5. `node scripts/validate-i18n.mjs` lists anything that drifted from the English.

## Reviewing, as a person

Read the draft against the English, line by line. Fix anything that says something slightly
different, and check every number, date and tool name. Clear every warning the validator gives for
the file. Then either send a change that sets `status: reviewed`, `reviewedBy: "Your name"` and
`reviewedOn: "<date>"`, or, if you are an owner reading it yourself:

```
node scripts/build-i18n.mjs review <file> "Your name"
```

An owner merges it. It goes live on the next build, under the reviewer's name, with a line on the
page saying who checked it and that the English is right if the two ever disagree.

A language's **menus** go live only when the catalogue is complete (every English string
translated), reviewed and current. A half-translated menu stays English.

## Roles

A person who reviews is given the **Language reviewer** role (`translator`) with the language as
its purpose, from `/admin/users` or `/admin/people`. It opens `/admin/translations`, which shows
what is waiting. The role is the project's record of who was asked to review; the signature on the
translation is the reviewer's own name in the file, which is a change the project can see.

## What is translated, and what is not yet

Translated: lesson text, objectives and flashcards; menus, footer, the lesson page's labels, the
complete-lesson button. Not yet: Sky, the module quiz banks, the account and accessibility panels,
and the sources block. They stay in English, and `/languages` says so. Quiz banks and Sky are
next, under the same rule.

## State today (16 October 2026)

No language is live. A Hindi draft of the interface and of one lesson (Explorer E1 lesson 1) is
waiting for a reader of Hindi. Bengali, Marathi, Tamil, Telugu, Spanish, French, Portuguese (Brazil),
Arabic, Simplified Chinese, Indonesian and Swahili have no drafts: a draft is made when a reviewer
exists for that language, so no effort is spent on text nobody can check.
