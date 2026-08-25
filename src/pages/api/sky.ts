import type { APIRoute } from 'astro';
import { SKY_MODE, SKY_LIMITS, SKY_COPY, SKY_REFUSE_PATTERNS } from '../../lib/sky-config';
import index from '../../generated/sky-index.json';
import quizbank from '../../generated/sky-quizbank.json';
import { prepareQuiz, quizMatch, wantsAnswerKey } from '../../lib/sky-guard.js';

/* This route must run per-request; the rest of the site is prerendered. */
export const prerender = false;

/**
 * POST /api/sky — the only thing the browser ever talks to.
 *
 * Everything worth stealing lives on this side of the boundary: the API key,
 * the model name, the system prompt, the retrieval index. The browser sends a
 * question and a page path and receives an answer plus source links. Viewing
 * source, opening devtools or replaying a request reveals nothing.
 *
 * The order of the guards below is deliberate — cheapest and most decisive
 * first, so an abusive request is rejected before it costs anything.
 */

type Chunk = { id: string; url: string; title: string; heading: string | null; text: string; kind: string };
const CHUNKS = (index as { chunks: Chunk[] }).chunks;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      // An assistant answer is per-question and per-user; nothing may cache it.
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });

const STOP = new Set(('a an the and or but if of to in on for with is are was were be been do does did ' +
  'i you it this that what how why when where can could should would my your our their about from as at by').split(' '));

const tokens = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

/** Document frequency, computed once, so a word common to every lesson counts
 *  for little and a rare one counts for a lot. Without this, "ai" and "lesson"
 *  dominate every query on an AI learning site. */
const DF = new Map<string, number>();
for (const c of CHUNKS) for (const w of new Set(tokens(c.text))) DF.set(w, (DF.get(w) ?? 0) + 1);

function retrieve(question: string, limit = 4) {
  const qs = tokens(question);
  if (!qs.length) return [];
  const scored = CHUNKS.map((c) => {
    const bag = new Set(tokens(c.text));
    let score = 0, hits = 0;
    for (const w of qs) {
      if (!bag.has(w)) continue;
      hits++;
      score += Math.log(CHUNKS.length / (1 + (DF.get(w) ?? 0)));
    }
    // Normalise by question length so long questions are not automatically
    // "more relevant" than short ones.
    return { chunk: c, score: score / Math.sqrt(qs.length || 1), coverage: hits / qs.length };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  // BOTH gates. Score alone ranks an incidental mention of a rare word above a
  // genuine match; coverage alone lets a two-word question through on a
  // coincidence. See the note in sky-config.ts for the measured numbers.
  if (!top || top.score < SKY_LIMITS.minScore || top.coverage < SKY_LIMITS.minCoverage) return [];
  return scored.slice(0, limit);
}

/* Assessment integrity lives in src/lib/sky-guard.js so the exact code this
   route runs is the code the test suite exercises. A guard that can only be
   tested through a running Worker is a guard that stops being tested. */
const QUIZ_PREPARED = prepareQuiz((quizbank as { quiz: any[] }).quiz);

/** Redact things that look personal before anything leaves this process. The
 *  design promises Sky never asks for them; people volunteer them anyway. */
function redact(s: string) {
  return s
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[phone]')
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[number]');
}

async function rateLimit(env: any, key: string, limit: number): Promise<boolean> {
  // The SESSION KV namespace is already bound in wrangler.jsonc.
  const kv = env?.SESSION;
  // Fail CLOSED. If the limiter is unavailable we cannot bound spend or abuse,
  // and an assistant that cannot be rate-limited should not be answering.
  if (!kv) return false;
  const bucket = `sky:${key}:${new Date().toISOString().slice(0, 13)}`; // per hour
  const used = Number((await kv.get(bucket)) ?? '0');
  if (used >= limit) return false;
  await kv.put(bucket, String(used + 1), { expirationTtl: 3900 });
  return true;
}

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  // 1. Off means off. Checked here as well as in the page, so a flag flipped
  //    in devtools gets a 503 rather than an answer.
  if (SKY_MODE === 'off') {
    return json({ error: 'sky_disabled', message: SKY_COPY.unavailable }, 503);
  }

  // 2. Same-origin only. A cross-site page must not be able to spend our
  //    budget or use us as an open proxy.
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host || new URL(origin).host !== host) {
    return json({ error: 'bad_origin' }, 403);
  }

  let body: { q?: unknown; page?: unknown };
  try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }

  const q = typeof body.q === 'string' ? body.q.trim() : '';
  if (!q) return json({ error: 'empty' }, 400);

  // 3. Length cap — the cheapest defence against both cost blow-ups and
  //    prompt-injection payloads pasted in bulk.
  if (q.length > SKY_LIMITS.maxQuestionChars) {
    return json({ error: 'too_long', limit: SKY_LIMITS.maxQuestionChars }, 413);
  }

  // 4. Hard refusals, before retrieval and before spending anything.
  //    These cannot be left to a relevance score: a lesson that mentions
  //    "risk" or "contract" in passing must never become the basis for
  //    answering somebody's real medical or legal question, however well it
  //    happens to match. Refusing early also means such a question is never
  //    sent to a third-party provider at all.
  if (SKY_REFUSE_PATTERNS.some((re) => re.test(q))) {
    return json({
      verdict: 'out_of_scope',
      title: SKY_COPY.outOfScopeTitle,
      message: SKY_COPY.outOfScope,
      handoff: [{ label: 'Ask a person instead', href: '/feedback' }],
    });
  }

  // 5. Assessment integrity. Checked before retrieval and before any spend:
  //    a learner mid-quiz must not be able to have Sky sit it for them.
  //    The refusal still teaches — it names the lesson to re-read — because
  //    stonewalling a learner is not the goal; not answering FOR them is.
  const page = typeof body.page === 'string' ? body.page : '/';
  const quizHit = quizMatch(q, page, QUIZ_PREPARED, SKY_LIMITS);
  if (quizHit || wantsAnswerKey(q)) {
    const mod = quizHit?.module ?? null;
    const back = quizHit?.lesson
      ? { label: 'Re-read the lesson', href: '/learn/' + quizHit.lesson }
      : mod
        ? { label: `Re-read module ${mod.toUpperCase()}`, href: '/roadmap' }
        : { label: 'Back to the roadmap', href: '/roadmap' };
    return json({
      verdict: 'assessment',
      title: SKY_COPY.assessmentTitle,
      message: SKY_COPY.assessment,
      handoff: [back, { label: 'Daily review', href: '/review' }],
    });
  }

  // 6. Rate limit before retrieval, and before any provider call.
  const env = (locals as any)?.runtime?.env;
  const ip = clientAddress ?? 'unknown';
  if (!(await rateLimit(env, `ip:${ip}`, SKY_LIMITS.maxPerIpPerHour))) {
    return json({ error: 'rate_limited', message: 'Too many questions for now. Try again shortly.' }, 429);
  }

  // 7. Retrieve from our own index. No match, no answer — this is the whole
  //    promise, and it is enforced here rather than requested in a prompt,
  //    because a prompt is a suggestion and this is a return statement.
  const hits = retrieve(q);
  if (!hits.length) {
    return json({
      verdict: 'out_of_scope',
      title: SKY_COPY.outOfScopeTitle,
      message: SKY_COPY.outOfScope,
      handoff: [
        { label: 'Send this to a person', href: '/feedback' },
        { label: 'Search the site', href: '/roadmap' },
      ],
    });
  }

  const sources = hits.map((h) => ({
    label: h.chunk.heading ? `${h.chunk.title} — ${h.chunk.heading}` : h.chunk.title,
    href: h.chunk.url,
  }));

  /* 8. The provider seam.
   *
   * This is the ONLY part of Sky that needs a key, and it is deliberately the
   * last thing that happens: every guard above has already run, the context is
   * already narrowed to passages from this site, and the sources are already
   * decided. A provider is given the retrieved passages and the question, and
   * is never given the open web.
   *
   * Retrieved text is DATA, not instructions. Whoever wires this up must pass
   * the passages as user content and keep the system prompt fixed — a lesson
   * that happens to contain the words "ignore previous instructions" is a
   * string, and must be treated as one.
   *
   * KNOWN LIMIT, measured. Retrieval narrows; it does not adjudicate. Asked
   * "What is the capital of France?", the gates above let the question through
   * — because E1·L6 genuinely contains the sentence "The capital of France is
   * ___" as a next-word-prediction example. The retrieval is correct and the
   * passage still does not answer the question.
   *
   * No keyword threshold fixes that case without breaking legitimate ones, so
   * the second stage must: the system prompt has to instruct refusal when the
   * supplied passages do not actually contain the answer, and the response
   * must be rejected here if it cites nothing. This is precisely why the
   * design gates rollout on 200 staff questions reviewed by hand and a
   * wrong-answer rate under 2% before Sky reaches a single learner.
   */
  const apiKey = env?.SKY_API_KEY;
  if (!apiKey) {
    // Honest failure. Sky is enabled but not configured, so it says it is
    // unavailable rather than inventing an answer from the retrieved text.
    return json({ error: 'not_configured', message: SKY_COPY.unavailable, sources }, 503);
  }

  return json({
    error: 'provider_not_implemented',
    message: SKY_COPY.unavailable,
    sources,
  }, 503);
};

/** Anything other than POST is a mistake or a probe. */
export const GET: APIRoute = () => json({ error: 'method_not_allowed' }, 405);
