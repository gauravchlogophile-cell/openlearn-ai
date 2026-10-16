# Languages: proposal for approval

> **Decided 16 October 2026.** The Wave 1 list below is approved for building. The owner agreed with
> the recommendation on the second decision: **no machine-drafted page goes live before a person has
> reviewed it.** How that is built and enforced is in `translation-workflow.md`. Wave 2 stays a plan.

Written 16 October 2026. **Nothing here is built yet.** The owner asked for the
list of languages to be put forward for approval before any work starts; this is
that list, with what each choice commits Lrnon to.

## The rule this has to respect

Lrnon's own guide says we never machine-translate the curriculum and call it
multilingual (E10·L8). Lessons carry dated, sourced claims about fast-moving tools;
a translation that quietly changes "usually" to "always" is the kind of silent error
that destroys trust. So the proposal is **people first, machine second**:

- A machine can produce a first draft. A named human reviewer who reads the target
  language fluently and understands the subject checks every lesson before it is
  published as that language.
- A page that is draft-only is shown with a visible label ("Machine draft, not yet
  reviewed") and a one-tap switch back to English. It is never presented as final.
- Meaning must not drift. Tool names, product names, code, commands, numbers, dates
  and the "last checked" stamps stay exactly as in English; the surrounding words
  are translated. Every translated lesson links back to the English one it came
  from, and the English text is the source of truth when they disagree.

## Proposed languages

### Wave 1: India (the largest group of likely learners)

| Language | Script | Direction | Why now |
|---|---|---|---|
| Hindi | Devanagari | LTR | Largest; the owner asked for it by name |
| Bengali | Bengali | LTR | Large; strong device voice support |
| Marathi | Devanagari | LTR | Shares a script with Hindi, so cheaper to add |
| Tamil | Tamil | LTR | Large; good device voices |
| Telugu | Telugu | LTR | Large; good device voices |

### Wave 1: global

| Language | Script | Direction | Why now |
|---|---|---|---|
| Spanish | Latin | LTR | Largest non-English reach |
| French | Latin | LTR | West and Central Africa, Canada, Europe |
| Portuguese (Brazil) | Latin | LTR | Large, under-served by AI teaching material |
| Arabic | Arabic | **RTL** | Needs a right-to-left layout pass; flag it as the costliest |
| Chinese (Simplified) | Han | LTR | Large; needs a font and line-breaking pass |
| Indonesian | Latin | LTR | Large; cheap to add |
| Swahili | Latin | LTR | East Africa; few AI learning resources exist |

### Wave 2 (after Wave 1 is reviewed and used)

Gujarati, Kannada, Malayalam, Punjabi, Odia, Urdu (RTL), German, Japanese, Russian,
Turkish, Vietnamese, Korean, Italian, Filipino, Nepali, Assamese.

### Not proposed, and why

- **All 22 scheduled Indian languages at once.** The limit is trusted reviewers, not
  software. Better to ship five properly than twenty-two as drafts.
- **Languages with no reviewer.** If nobody can check it, it does not ship.

## What a reader would get

- A language choice in the header and in Accessibility, remembered on the device.
- Lessons, quizzes, review cards and the interface in that language, with the right
  `lang` attribute (so screen readers and read-aloud pick the right voice), the
  right font (Noto families are available for every script above), and the right
  text direction.
- Read-aloud using the device's voices for that language, and a clear message when
  the device has none (see `narration.md`).
- Sky's own words in the same language.
- A one-tap switch to English on every page, always.

## What it costs

| Item | Wave 1 estimate |
|---|---|
| Machine first draft of the library | Small (hours of compute and checking) |
| **Human review** of every lesson in 12 languages | **The real cost**, in volunteer or paid reviewer time. Needs at least one named reviewer per language |
| Interface strings (menus, Sky, quizzes) | Moderate; done once per language |
| RTL layout pass (Arabic, later Urdu) | One focused piece of work |
| Fonts | Free (Noto) but adds weight; load only for the chosen script |
| Keeping it current | Every English update must re-flag the translations; the weekly freshness issue would list stale translations too |

## Decisions needed from the owner

1. Approve, change or trim the Wave 1 list above.
2. Confirm the "people first, machine second" rule, or say if a draft-labelled
   machine translation may go live before review.
3. Decide how reviewers are found and thanked (volunteer roles page, paid, or
   partner organisations).
4. Confirm the order: India first, global first, or one of each language group in
   turn.

Until these are answered nothing will be translated, and nothing on the site will
claim to be multilingual.
