import type { APIRoute } from 'astro';
import { SKY_MODE, SKY_LIMITS, SKY_COPY, SKY_REFUSE_PATTERNS } from '../../lib/sky-config';
import index from '../../generated/sky-index.json';
import quizbank from '../../generated/sky-quizbank.json';
import { prepareQuiz, quizMatch, wantsAnswerKey } from '../../lib/sky-guard.js';
import {
  callModel, parseProvider, buildUserTurn, citesASource, SKY_SYSTEM,
} from '../../lib/sky-providers';
import { createClient } from '@supabase/supabase-js';
import { skyAudience, leastPermissive } from '../../lib/sky-audience.js';

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

/** Redact things that look personal. The design promises Sky never asks for
 *  them; people volunteer them anyway.
 *
 *  WIRED, and called on the exact line the question is handed over — inside
 *  buildUserTurn's argument, which is the last moment the text is still ours.
 *
 *  For a long time this had no caller and a comment claiming it ran "before
 *  anything leaves this process": safety-shaped, and a no-op. The comment then
 *  stayed stale for a second time after the provider WAS wired, because a
 *  multi-line search-and-replace silently matched nothing against CRLF line
 *  endings and the change was reported as made. Twice wrong in opposite
 *  directions, which is a good argument for grepping the call site rather than
 *  trusting the comment above the function. */
export function redactForProvider(s: string) {
  return s
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[phone]')
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[number]');
}

/** APPROXIMATE, and the tolerance is accepted deliberately — see below.
 *
 *  This is a read-modify-write over Workers KV, which is neither atomic nor
 *  strongly consistent, so `limit` is a soft ceiling rather than a hard one.
 *  Two ways it is exceeded:
 *
 *    - Concurrency. Two requests can both read 5, both find 5 < limit, and
 *      both write 6. Two calls happen, the counter advances by one.
 *    - Propagation. KV reads are eventually consistent across edge locations,
 *      so a client spraying requests through different PoPs reads a stale low
 *      count for some seconds and can exceed the cap by a wide margin.
 *
 *  A hard cap needs a Durable Object (single-threaded, strongly consistent),
 *  which is a new binding and class rather than a change to this function.
 *  That is the right fix and it is NOT done here.
 *
 *  It is no longer the only control, and no longer the one that matters for
 *  money. 0013 moved the spend ceiling into Postgres, where the check and the
 *  increment happen in one statement under a row lock — see reserveBudget()
 *  below. This remains cheap per-IP traffic shaping, a job an approximate
 *  counter does perfectly well.
 *
 *  The distinction is worth keeping: this bounds NUISANCE, sky_reserve()
 *  bounds MONEY. Do not let a future change quietly make this the money
 *  control again.
 *
 *  Fails CLOSED when the namespace is missing: an assistant that cannot be
 *  rate-limited at all should not be answering.
 */
async function rateLimit(env: any, key: string, limit: number): Promise<boolean> {
  // The SESSION KV namespace is already bound in wrangler.jsonc.
  const kv = env?.SESSION;
  if (!kv) return false;
  const bucket = `sky:${key}:${new Date().toISOString().slice(0, 13)}`; // per hour
  const used = Number((await kv.get(bucket)) ?? '0');
  if (used >= limit) return false;
  await kv.put(bucket, String(used + 1), { expirationTtl: 3900 });
  return true;
}

/** The role a Supabase key CLAIMS, read for diagnostics only.
 *
 *  This is not verification and is never used to decide anything — the
 *  signature is checked at the database, where it belongs. It exists because
 *  the anon key and the service key are both long strings beginning "eyJ",
 *  they sit inches apart on the same dashboard page, and pasting the wrong one
 *  produces a permission error that names neither of them. An operator then
 *  has a key that looks entirely correct and an error that points elsewhere.
 *
 *  Returns the role NAME only. No part of any key is returned, logged, or
 *  included in a response.
 */
function keyRole(key: string | undefined): string | null {
  if (!key) return null;
  const payload = key.split('.')[1];
  if (!payload) return null;   // not a JWT — the newer sb_secret_… format
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const role = JSON.parse(json)?.role;
    return typeof role === 'string' ? role : null;
  } catch { return null; }
}

/** The Worker's own database client, holding the SERVICE key.
 *
 *  Not the anon key. sky_reserve() is granted to service_role alone, because a
 *  budget counter that a signed-in learner could call in a loop is not a
 *  budget. The service key lives in the Worker environment and never reaches
 *  a browser.
 */
function serviceDb(env: any) {
  /* The URL falls back to the build-time value, as identify() and verify.ts
     both already do. It was read from the runtime binding ALONE here, and the
     two are stocked from different places: PUBLIC_SUPABASE_URL has to be a
     BUILD variable because Astro inlines it, so the runtime binding is
     routinely absent even on a correctly configured Worker. The effect was a
     budget reservation that failed closed for a reason nobody had got wrong —
     Sky would have kept refusing after the service key was finally set.
     Safe to inline: it is the public project URL, not a credential. */
  const url = env?.PUBLIC_SUPABASE_URL ?? import.meta.env.PUBLIC_SUPABASE_URL;
  const key = env?.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Reserve worst-case budget before calling a provider.
 *
 *  Fails CLOSED on every path: no database, no client, an error, a refusal —
 *  all of them mean "do not spend". The KV limiter above is a soft ceiling by
 *  its own admission; this is the hard one, and a hard cap that fails open is
 *  a soft cap with extra steps.
 */
async function reserveBudget(env: any, maxTokens: number):
    Promise<{ allowed: boolean; reservation: number | null; why: string }> {
  const db = serviceDb(env);
  /* Three quite different faults used to leave by this one door reporting the
     same word, and the operator-visible symptom of all three is identical: Sky
     says it is off. Naming them costs nothing and saves a round of guessing —
     the same reason missing() names which setting is unset. */
  if (!db) {
    return { allowed: false, reservation: null, why:
      env?.SUPABASE_SERVICE_ROLE_KEY
        ? 'PUBLIC_SUPABASE_URL is not set on the Worker'
        : 'SUPABASE_SERVICE_ROLE_KEY is not set on the Worker — the spend cap '
          + 'cannot be read, and a cap that cannot be read does not permit spending' };
  }
  /* Checked before the error is interpreted, because the wrong key produces a
     permission error that reads like a missing grant, and an operator would go
     looking at the migration instead of at the key they pasted. */
  const role = keyRole(env?.SUPABASE_SERVICE_ROLE_KEY);
  if (role && role !== 'service_role') {
    return { allowed: false, reservation: null, why:
      `SUPABASE_SERVICE_ROLE_KEY holds a "${role}" key, not a service_role key `
      + '— the anon key sits beside it on the same page and will not work here, '
      + 'because sky_reserve() is granted to service_role alone' };
  }
  const { data, error } = await db.rpc('sky_reserve', { p_max_tokens: maxTokens });
  if (error) {
    /* 42883 is undefined_function: migration 0013 has not been applied to this
       database. Worth saying out loud, because it looks exactly like a bad key. */
    const undefinedFn = error.code === '42883'
      || /sky_reserve/i.test(error.message ?? '') && /does not exist/i.test(error.message ?? '');
    return { allowed: false, reservation: null, why: undefinedFn
      ? 'sky_reserve() does not exist in the database — apply migration '
        + '0013_sky_budget.sql to production'
      : `the budget reservation failed: ${error.message ?? 'unknown error'}` };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (row?.allowed !== true) {
    return { allowed: false, reservation: null,
             why: "today's spend cap is reached — this is the cap working, not a fault" };
  }
  return { allowed: true, reservation: row?.reservation ?? null, why: 'ok' };
}

/** Correct the reservation to actual usage. Best-effort: a failure here
 *  over-counts the day's spend, which is the safe direction to be wrong in. */
async function settleBudget(env: any, reservation: number | null,
    input: number, output: number, provider: string, model: string, ok: boolean) {
  if (reservation == null) return;
  const db = serviceDb(env);
  if (!db) return;
  /* try/catch, not .catch(): the query builder is a thenable, not a Promise,
     so it has no .catch to call. Accounting must never break an answer the
     learner has already paid for. */
  try {
    await db.rpc('sky_settle', {
      p_reservation: reservation, p_input: input, p_output: output,
      p_provider: provider, p_model: model, p_ok: ok,
    });
  } catch { /* over-counts the day, which is the safe direction */ }
}

/** Who is asking. Verified at the database, never taken on the client's word.
 *
 *  The access token arrives in the Authorization header. Handing it to a
 *  Supabase client means PostgREST validates the signature before is_owner()
 *  or has_role() runs, so a hand-edited token resolves to nobody rather than
 *  to whoever it claims to be.
 *
 *  Every failure path returns { userId: null, isStaff: false } — the least
 *  privileged answer — so a database outage cannot promote a stranger to
 *  staff. */
type Viewer = { userId: string | null; isStaff: boolean; why: string };

async function identify(locals: any, request: Request): Promise<Viewer> {
  const nobody = (why: string): Viewer => ({ userId: null, isStaff: false, why });

  const auth = request.headers.get('authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return nobody(auth ? 'auth_header_not_bearer' : 'no_auth_header');

  const env = locals?.runtime?.env;
  const url = env?.PUBLIC_SUPABASE_URL ?? import.meta.env.PUBLIC_SUPABASE_URL;
  const anon = env?.PUBLIC_SUPABASE_ANON_KEY ?? import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return nobody('supabase_not_configured_in_worker');

  try {
    const db = createClient(url, anon, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: user, error: userErr } = await db.auth.getUser(token);
    const id = user?.user?.id ?? null;
    if (!id) return nobody(`token_rejected:${userErr?.message ?? 'no user'}`);

    const [owner, admin, sub] = await Promise.all([
      db.rpc('is_owner'),
      db.rpc('has_role', { wanted: 'admin' }),
      db.rpc('has_role', { wanted: 'sub_admin' }),
    ]);

    /* Errors used to be discarded here. A failing is_owner() then read exactly
       like "not staff", so a broken grant, a revoked EXECUTE or an expired
       token all produced the same silent refusal with nothing to look at. */
    const rpcErr = owner.error ?? admin.error ?? sub.error;
    if (rpcErr) {
      return { userId: id, isStaff: false, why: `role_lookup_failed:${rpcErr.message}` };
    }

    /* 10g defines the staff stage as "people with an admin or sub-admin role".
       Owners are included because excluding the person running the rollout
       from the stage they are meant to be reviewing would be absurd. */
    const isStaff = Boolean(owner.data) || Boolean(admin.data) || Boolean(sub.data);
    return {
      userId: id, isStaff,
      why: isStaff ? 'staff' : 'signed_in_no_role',
    };
  } catch (e) {
    return nobody(`identify_threw:${(e as Error)?.message ?? 'unknown'}`);
  }
}

/** The stage recorded in the database — the half of the switch an operator can
 *  change in one click.
 *
 *  Read with the service key because sky_rollout_log is admin-only by RLS, and
 *  the person this protects is a learner mid-question, not an administrator.
 *  No new table: the newest row IS the current stage, which is also what
 *  /admin/sky renders, so the console and the route cannot disagree about what
 *  was pressed.
 *
 *  Returns null when it cannot be read, which leaves the constant standing.
 *  That is safe rather than convenient: if the database is genuinely down then
 *  reserveBudget() below fails closed a few lines later and Sky refuses anyway,
 *  so an unreadable mode cannot leave Sky answering unbudgeted.
 */
async function recordedMode(locals: any): Promise<string | null> {
  try {
    const db = serviceDb(locals?.runtime?.env);
    if (!db) return null;
    const { data, error } = await db
      .from('sky_rollout_log').select('mode').order('at', { ascending: false }).limit(1);
    if (error) return null;
    return (Array.isArray(data) ? data[0]?.mode : null) ?? null;
  } catch { return null; }
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

  /* 2b. WHO is asking, and does this mode admit them?
   *
   *  Until this existed the route checked only whether the mode was 'off'.
   *  'staff' — the first step of the documented rollout — therefore served
   *  every anonymous visitor, which is the precise opposite of what the mode
   *  is for. The dock button had the same hole.
   *
   *  Identity comes from the caller's Supabase access token, verified by
   *  PostgREST rather than trusted here: a forged token fails signature
   *  checking at the database and is_owner() simply returns false. The client
   *  cannot promote itself by editing a request.
   *
   *  Fails closed throughout — no token, an unreadable token, an unreachable
   *  database all mean "not staff", which in 'staff' mode means refused. */
  const viewer = await identify(locals as any, request);
  const liveMode = leastPermissive(SKY_MODE, await recordedMode(locals as any));
  const verdict = skyAudience(liveMode, viewer, SKY_LIMITS.slicePercent);
  if (!verdict.allowed) {
    /* Two switches means two reasons to be refused, and they need different
       things done about them. Tell a STAFF member which one they hit — they
       are the only person who can act on it, and "Sky is off right now" while
       they are looking at a console that says Staff & volunteers is a way to
       lose an afternoon.
       Everyone else gets the plain wording: a learner does not need to know
       which of our switches is down, only that a person will answer. */
    const byCeiling = skyAudience(SKY_MODE, viewer, SKY_LIMITS.slicePercent);
    const narrowedByConsole = viewer.isStaff && byCeiling.allowed;

    console.error('[sky] refused', {
      ceiling: SKY_MODE, live: liveMode,
      identified: viewer.why, isStaff: viewer.isStaff, verdict: verdict.reason,
    });

    return json({
      error: 'sky_disabled',
      message: narrowedByConsole
        ? 'Sky is switched off from the admin console. The deployed build allows '
          + 'this stage, so the rollout row is what is holding it — set the stage '
          + 'again at /admin/sky and it will answer.'
        : SKY_COPY.unavailable,
      /* Returned ONLY to a caller who supplied a token, and it describes that
         caller's own request: which stage is live, and where their identity
         stopped resolving. Nothing about anybody else, and an anonymous probe
         learns nothing it could not already see.
         Without this the only channel was `wrangler tail`, which needs
         credentials the person hitting the problem may not have to hand. */
      ...(request.headers.get('authorization')
        ? { diagnostic: { ceiling: SKY_MODE, live: liveMode,
                          identified: viewer.why, verdict: verdict.reason } }
        : {}),
    }, 503);
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
   * APPLY redactForProvider(q) HERE, at the moment the question is handed to
   * the provider. It is not called anywhere yet because nothing leaves this
   * process yet; the first line of the provider call is where it belongs.
   * Learners volunteer emails and phone numbers into free-text boxes even
   * when never asked, and this is the last point at which that is our choice.
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
  /* Three separate settings, and until now all three refused with the same
     word. "not_configured" told an operator that something was missing but
     never WHICH — so the only way forward was to re-enter all of them and
     hope.

     NAMES only, never values. Saying which variable is absent is the whole
     point and is safe; echoing any part of a key would put a secret in a
     response body. SKY_PROVIDER and SKY_MODEL echo their values because
     neither is a secret and a typo in either is a likely cause — "Gemini" with
     a capital G parses fine, but a stray space or a retired model name does
     not, and seeing the string is how you spot that.

     Rides along only for a caller who supplied a token, like the audience
     diagnostic. */
  const missing = (name: string) => json({
    error: 'not_configured',
    message: SKY_COPY.unavailable,
    sources,
    ...(request.headers.get('authorization')
      ? { diagnostic: {
            missing: name,
            note: `The Worker cannot read ${name} at runtime. Check it is set on `
                + 'the openlearn-ai Worker itself rather than another service, '
                + 'and that the name matches exactly, including case.',
            seen: {
              SKY_API_KEY: env?.SKY_API_KEY ? 'present' : 'ABSENT',
              SKY_PROVIDER: env?.SKY_PROVIDER ? `present ("${env.SKY_PROVIDER}")` : 'ABSENT',
              SKY_MODEL: env?.SKY_MODEL ? `present ("${env.SKY_MODEL}")` : 'ABSENT',
              /* Reports the role the key claims, never the key. "present" was
                 not enough: the anon key is also present, also long, also
                 starts eyJ, and is the single most likely thing to be here by
                 mistake. */
              SUPABASE_SERVICE_ROLE_KEY: !env?.SUPABASE_SERVICE_ROLE_KEY ? 'ABSENT'
                : keyRole(env.SUPABASE_SERVICE_ROLE_KEY) === 'service_role'
                  ? 'present (role: service_role)'
                  : `present, but claims role "${keyRole(env.SUPABASE_SERVICE_ROLE_KEY) ?? 'unreadable'}"`
                    + ' — this is probably the WRONG key',
              runtime_env: env ? 'readable' : 'UNREADABLE — locals.runtime.env is undefined',
            },
          } }
      : {}),
  }, 503);

  const apiKey = env?.SKY_API_KEY;
  if (!apiKey) return missing('SKY_API_KEY');

  const provider = parseProvider(env?.SKY_PROVIDER);
  if (!provider) {
    /* Not inferred from the key's shape. Guessing the vendor from a secret's
       prefix means a misconfiguration posts the key to the WRONG vendor's
       endpoint, which is a credential disclosure rather than a failed call. */
    return missing('SKY_PROVIDER');
  }

  const model = env?.SKY_MODEL;
  if (!model) return missing('SKY_MODEL');

  /* 9. Money. Reserved BEFORE the call, from Postgres, under a row lock.
   *
   *    The KV limiter above shapes traffic and cannot bound spend — its own
   *    comment says so. This is the hard cap that comment demanded, and it
   *    fails CLOSED: if the budget cannot be reached, Sky does not answer.
   *    An assistant that cannot count what it is spending should not spend. */
  const budget = await reserveBudget(env, SKY_LIMITS.maxAnswerTokens);
  if (!budget.allowed) {
    /* Same rule as missing(): the reason rides along only for a caller who
       supplied a token, so an anonymous visitor learns nothing about our
       configuration and an operator running the self-test learns everything. */
    return json({
      error: 'budget',
      message: SKY_COPY.unavailable,
      sources,
      ...(request.headers.get('authorization')
        ? { diagnostic: { stage: 'budget', why: budget.why } }
        : {}),
    }, 503);
  }

  /* 10. The call. Redaction happens on this line and not before, because this
   *     is the moment the question stops being ours — learners volunteer
   *     emails and phone numbers into free-text boxes even when never asked. */
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SKY_LIMITS.providerTimeoutMs);

  let result;
  try {
    result = await callModel({
      provider, apiKey, model,
      baseUrl: env?.SKY_BASE_URL,
      system: SKY_SYSTEM,
      user: buildUserTurn(redactForProvider(q),
        hits.map((h) => ({
          label: h.chunk.heading ? `${h.chunk.title} — ${h.chunk.heading}` : h.chunk.title,
          text: h.chunk.text,
        }))),
      maxTokens: SKY_LIMITS.maxAnswerTokens,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  await settleBudget(env, budget.reservation,
    result.ok ? result.inputTokens : 0,
    result.ok ? result.outputTokens : 0,
    provider, model, result.ok);

  if (!result.ok) {
    /* The reason goes to the Worker log, never to the browser. It names the
       provider's status and, for Gemini, the finishReason — which is the
       difference between "the key is wrong", "safety filtering fired" and
       "MAX_TOKENS was reached before any answer text", the last being what
       happens when a thinking model spends the output budget reasoning.
       Without this the operator sees only a generic 502 and has nothing to act
       on. Observability is already enabled in wrangler.jsonc, so this lands in
       `wrangler tail` and the dashboard.

       The learner's question is deliberately NOT logged — a log of what
       children asked an assistant is not a debugging convenience worth
       keeping. */
    console.error('[sky] provider failed', {
      provider, model, status: result.status, reason: result.reason,
    });
    return json({ error: 'provider', message: SKY_COPY.unavailable, sources }, 502);
  }

  /* 11. The promise, enforced. "Never guesses" is not a prompt instruction we
   *     hope was followed — an answer citing nothing is discarded here, before
   *     the learner sees it, and they get the out-of-scope handoff instead.
   *
   *     This is the guard for the measured failure noted above: asked "what is
   *     the capital of France?", retrieval legitimately surfaces E1·L6 because
   *     that lesson contains the phrase as a word-prediction example. The
   *     passage does not answer the question, the model is told to say so, and
   *     if it answers anyway without a citation this discards it. */
  if (!result.text || !citesASource(result.text, hits.length)) {
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

  return json({
    verdict: 'answer',
    answer: result.text,
    sources,
    disclaimer: SKY_COPY.disclaimer,
  });
};

/** Anything other than POST is a mistake or a probe. */
export const GET: APIRoute = () => json({ error: 'method_not_allowed' }, 405);
