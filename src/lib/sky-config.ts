/** Sky — the site assistant. Configuration and gating.
 *
 *  Sky answers questions about Lrnon, cites the page it read, and never
 *  guesses. It reads this site only; a question outside that scope is refused
 *  and routed to a human rather than answered from general knowledge.
 *
 *  From the design: "Sky reaching learners is a decision, not a default."
 *  So it ships OFF, and off means genuinely off — the dock button is not
 *  rendered and /api/sky returns 503. Both, independently: a flag flipped in
 *  devtools gets a 503, not an answer.
 */

export type SkyMode = 'off' | 'staff' | 'everyone';

/**
 * Ships 'off' and must stay that way until the gates below are green.
 *
 * Turning Sky on is not a styling change. It introduces this project's first
 * recurring cost, against a README that promises "Free forever"; it sends
 * learner questions to a third party; and it puts generated text in front of
 * people who came here to learn, where being confidently wrong is the specific
 * harm E1·L7 teaches them to guard against.
 *
 * Gates, from the design, before this may become 'everyone':
 *   1. 200 staff questions reviewed by hand
 *   2. No answer without a source
 *   3. Wrong-answer rate under 2%
 *   4. Refusal wording signed off by a teacher
 */
export const SKY_MODE: SkyMode = 'off';

/** Which parts of the site Sky may read. Community rooms and Ask Doubts are
 *  excluded deliberately: they are learner-written, so quoting them would let
 *  one learner's mistake be repeated back to another as if it were the site's
 *  answer. */
export const SKY_SCOPES = {
  lessons: true,
  policies: true,
  funding: true,
  doubts: false,
  rooms: false,
} as const;

/** Hard caps. Deliberately mean — a learning site's assistant has no reason to
 *  accept an essay, and a length cap is the cheapest defence against both cost
 *  blow-ups and prompt-injection payloads. */
export const SKY_LIMITS = {
  maxQuestionChars: 500,
  maxPerSessionPerHour: 20,
  maxPerIpPerHour: 60,

  /* Retrieval gate. Both must be cleared, because either alone is fooled.
   *
   * Measured against the real index: in-scope questions score 3.5-4.2 with
   * 50-100% of their distinctive terms present; out-of-scope ones ("my
   * daughter's exam form was rejected", "how do I fix my car engine") score
   * 1.4-2.0 with 20-33% coverage.
   *
   * Score alone is actively misleading. "What is the capital of France?"
   * scored 6.28 — the HIGHEST of anything tried — because E1·L6 contains the
   * sentence "The capital of France is ___" as a next-word-prediction example.
   * Rare terms carry huge IDF weight, so an incidental mention outranks a
   * genuine one. Coverage is the sanity check that catches that class. */
  minScore: 2.5,
  minCoverage: 0.5,

  /* Assessment guard. The share of a quiz stem's distinctive words that must
   * appear in the asked question before it counts as being the quiz question
   * itself. Set from measurement: a verbatim paste scores 1.0 and stays near
   * 1.0 with chatter wrapped around it, while a genuine paraphrase of the same
   * CONCEPT sits well below. That is exactly the line we want — understanding
   * the idea is the point of the site; being told which box to tick is not. */
  quizOverlap: 0.9,
  /** Stricter while the learner is actually on a quiz page. */
  quizOverlapOnQuiz: 0.6,
};

/** Topics Sky must refuse outright, before retrieval, however well the site
 *  happens to match. The design's rule is "no medical, legal, exam-authority
 *  or personal advice", and that cannot be left to a relevance score: a lesson
 *  mentioning "risk" or "contract" in passing must never become the basis for
 *  answering someone's real medical or legal question. */
export const SKY_REFUSE_PATTERNS: RegExp[] = [
  /\b(medicine|medication|dose|dosage|symptom|diagnos|prescri|ibuprofen|paracetamol|antibiotic|pregnan|therapy|depress|suicid|self.harm)\w*/i,
  /\b(lawyer|solicitor|legal advice|lawsuit|sue|court|visa|immigration|custody|divorce|contract.{0,12}(sign|valid|binding))\w*/i,
  /\b(board exam|exam form|admission|admit card|result declared|revaluation|scholarship application|entrance test)\w*/i,
  /\b(invest|stock|shares|crypto|loan|tax return|refund status|insurance claim)\w*/i,
  /\b(emergency|police|abuse|threat|unsafe|being followed|help me now)\w*/i,
];

/** What Sky says when it will not answer. Kept here rather than inline so the
 *  wording can be reviewed as a whole — the design gates rollout on a teacher
 *  signing these off, which is impossible if they are scattered. */
export const SKY_COPY = {
  intro:
    "I can answer questions about anything on Lrnon — lessons, how the money works, volunteering. " +
    "I only read this site, so if the answer isn't here I'll say so.",
  disclaimer:
    'Sky can be wrong. Answers link to the page they came from. Nothing you type is used to train anything.',
  assessmentTitle: 'That one is yours to answer',
  assessment:
    'That looks like a question from a quiz you are taking, so I am not going to answer it. ' +
    'Getting it wrong and finding out why is how this sticks — that is what the explanations ' +
    'after each question are for. Ask me about the idea behind it in your own words and I will help.',
  outOfScopeTitle: 'Outside what I know',
  outOfScope:
    "I only read Lrnon's own pages, so I'd be guessing — and this matters too much for a guess.",
  unavailable:
    'Sky is off right now. Search still works, and feedback is answered by a person within two working days.',
  /** Categories Sky must refuse even when the site happens to mention them. */
  neverAdvise: ['medical', 'legal', 'exam-authority', 'financial', 'personal-safety'],
};
