/** Assessment integrity for Sky.
 *
 *  Sky must not sit the quiz for a learner. This lives in its own plain-JS
 *  module — the same pattern as progress-core.js and shuffle.js — so the exact
 *  code the route runs is also the code the test suite exercises. A guard that
 *  can only be tested through a running Worker is a guard that stops being
 *  tested.
 *
 *  Keeping quiz text out of the retrieval index would NOT solve this: a quiz
 *  tests what the lesson taught, so the lesson legitimately contains the answer
 *  in prose. Measured against the real corpus, seven module-quiz options and
 *  one stem appear verbatim in lesson text — correctly. So the check is on the
 *  question being ASKED, never on the corpus.
 */

const STOP = new Set(
  ('a an the and or but if of to in on for with is are was were be been do does did ' +
   'i you it this that what how why when where can could should would my your our their about from as at by')
    .split(' ')
);

export function tokens(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/** Phrases that mean only one thing on their own. "Send me the mark scheme"
 *  and "show the answer key" contain no assessment word at all, so the paired
 *  pattern below misses them entirely. */
const SOLO_RE =
  /\b(answer\s?keys?|mark\s?schemes?|marking\s?schemes?|cheat\s?sheets?|model\s?answers?)\b/i;

/** Plurals matter and cost a real leak when missed: \banswer\b does not match
 *  "answers", which let "give me the answers to the module quiz" through. */
const WANTS = String.raw`answers?|solutions?|correct (?:option|one)s?|right (?:option|one)s?|which option|what.{0,10}tick|cheat(?:\s?sheet)?|answer\s?keys?|mark\s?scheme`;
const ASSESSMENT = String.raw`quiz(?:zes)?|questions?|q\s?\d|tests?|exams?|module`;
const PAIRED_RE = new RegExp(
  String.raw`\b(?:${WANTS})\b[\s\S]{0,40}\b(?:${ASSESSMENT})\b|\b(?:${ASSESSMENT})\b[\s\S]{0,40}\b(?:${WANTS})\b`,
  'i'
);

/** Someone asking for the answer key rather than pasting a question. */
export function wantsAnswerKey(q) {
  return SOLO_RE.test(q) || PAIRED_RE.test(q);
}

/** Precompute token sets once; the route holds this for the process lifetime. */
export function prepareQuiz(quiz) {
  return quiz.map((x) => ({ ...x, set: new Set(tokens(x.q)) }));
}

/**
 * Does this question look like a quiz question the learner is being assessed on?
 *
 * Overlap is the share of the STEM's distinctive words present in what was
 * asked — deliberately asymmetric, so pasting a stem with chatter wrapped
 * around it ("hey sky, <stem>, which one?") still scores 1.0.
 *
 * The threshold depends on where the learner is standing, because the same
 * sentence means different things in different places. On a quiz page anything
 * close is refused: they are being assessed right now and the cost of a false
 * refusal is one rephrase. Elsewhere it takes a near-verbatim match, because
 * "what's the difference between machine learning and rule-based systems?" is
 * a learner learning even though a quiz asks almost exactly that — refusing it
 * would make Sky useless exactly when it is most wanted.
 */
export function quizMatch(question, page, prepared, limits) {
  const asked = new Set(tokens(question));
  if (asked.size < 2) return null;

  let best = null;
  for (const item of prepared) {
    // Two distinctive words is enough to be a stem. An earlier version skipped
    // anything under three, which let "What caused the 'AI winters'?" — two
    // tokens after stopwords — through to a full answer.
    if (item.set.size < 2) continue;
    let shared = 0;
    for (const w of item.set) if (asked.has(w)) shared++;
    const overlap = shared / item.set.size;
    if (!best || overlap > best.overlap) best = { ...item, overlap };
  }
  if (!best) return null;

  const onQuiz = String(page ?? '').startsWith('/quiz/');
  const threshold = onQuiz ? limits.quizOverlapOnQuiz : limits.quizOverlap;
  return best.overlap >= threshold ? best : null;
}
