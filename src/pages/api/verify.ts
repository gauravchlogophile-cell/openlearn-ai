import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { CODE_PATTERN } from '../../lib/certification';

/* Per-request, like /api/sky. The rest of the site is prerendered. */
export const prerender = false;

/**
 * POST /api/verify — public certificate verification.
 *
 * 10e's requirement is "no account needed", and that is not a convenience: the
 * person checking a certificate is a teacher with a printout or an employer
 * with a link, and neither has any reason to hold an account here. Requiring
 * one would fail exactly the people the page exists for.
 *
 * Two steps, and the split is the whole privacy design:
 *
 *   { code }             → status only. Never a name.
 *   { code, initials }   → the name, but only to someone who already knows it.
 *
 * 10e states the reasoning plainly: "most Lrnon learners are children, and a
 * code alone should not return a child's name to a stranger." Someone standing
 * with the holder can read the initials off their copy. Someone who scraped a
 * code cannot, and three wrong tries cools the code for an hour.
 *
 * The address is hashed here and never sent onward. The verify log exists to
 * rate-limit, and a table recording who checked which child's certificate would
 * be a worse thing to hold than the problem it solves.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      /* A verification answer is about one person and must not sit in a shared
         cache where the next request could be served someone else's result. */
      'cache-control': 'no-store',
    },
  });

/** SHA-256 of address + salt, truncated. Enough to count requests from one
 *  caller, not enough to work backwards to an address without the salt — which
 *  lives in the Worker's environment and never in the repository. */
async function hashAddress(address: string | undefined, salt: string): Promise<string | null> {
  if (!address) return null;
  const bytes = new TextEncoder().encode(salt + '|' + address);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].slice(0, 12)
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const env = (locals as any)?.runtime?.env;

  let body: { code?: unknown; initials?: unknown };
  try { body = await request.json(); }
  catch { return json({ error: 'bad_request' }, 400); }

  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';

  /* Shape first — cheapest and most decisive, the ordering /api/sky uses.
     The alphabet excludes 0/O and 1/I/L, so anything containing one is a
     mistyped code and can be answered without a database round trip. Two
     things follow from putting this ahead of the config check: a typo gets a
     real answer even while the database is unreachable, and the endpoint
     cannot be used to probe whether the database is up.

     We do not say WHICH character was wrong. That would describe the code
     alphabet to someone who does not have a code. */
  if (!CODE_PATTERN.test(code)) {
    return json({ found: false, reason: 'shape' });
  }

  const url  = env?.PUBLIC_SUPABASE_URL      ?? import.meta.env.PUBLIC_SUPABASE_URL;
  const anon = env?.PUBLIC_SUPABASE_ANON_KEY ?? import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    /* Local-only mode. Say so rather than pretending the code is unknown —
       "no such certificate" would be a lie that costs someone their afternoon,
       and this page exists precisely for people deciding whether to trust a
       document. */
    return json({ error: 'unconfigured',
      message: 'Verification needs the database, which is not configured here.' }, 503);
  }

  const db = createClient(url, anon, { auth: { persistSession: false } });

  /* The certification migrations can land in the database after this code
     lands on the site — they are applied by hand, deliberately. Until they do,
     PostgREST reports the function as missing (PGRST202) and the honest answer
     is "not available yet", not a generic failure. Someone standing there with
     a printed certificate deserves to know which of the two it is. */
  const notMigrated = (e: { code?: string; message?: string } | null) =>
    e?.code === 'PGRST202' || /could not find the function/i.test(e?.message ?? '');

  const unavailable = () => json({
    error: 'unavailable',
    message: 'Certificate verification is not switched on yet. No certificates '
           + 'have been issued, so there is nothing this could have told you.',
  }, 503);

  // ---------------------------------------------------------------- step one
  if (body.initials === undefined) {
    const { data, error } = await db.rpc('verify_credential', { p_code: code });
    if (notMigrated(error)) return unavailable();
    if (error) return json({ error: 'lookup_failed' }, 502);

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.found) return json({ found: false });

    /* 10e: holder "Not shown". The name is a separate, gated request. */
    return json({
      found: true,
      tier: row.tier,
      module: row.module_id,
      version: row.syllabus_version,
      issued_at: row.issued_at,
      state: row.state,
      /* Seeded test data. Passed through so the page can say so — a fixture
         that verifies exactly like a real certificate is a forgery. */
      is_fixture: row.is_fixture === true,
    });
  }

  // ---------------------------------------------------------------- step two
  const initials = typeof body.initials === 'string' ? body.initials.trim() : '';
  if (!initials) return json({ revealed: false });

  const salt = env?.VERIFY_IP_SALT ?? import.meta.env.VERIFY_IP_SALT ?? 'lrnon-dev-salt';
  const ipHash = await hashAddress(
    request.headers.get('cf-connecting-ip') ?? clientAddress, salt);

  const { data, error } = await db.rpc('reveal_credential', {
    p_code: code, p_initials: initials, p_ip_hash: ipHash,
  });
  if (notMigrated(error)) return unavailable();
  if (error) return json({ error: 'lookup_failed' }, 502);

  const row = Array.isArray(data) ? data[0] : data;

  if (row?.cooled) {
    return json({ revealed: false, cooled: true,
      message: 'Too many tries on this code. Try again in an hour.' }, 429);
  }
  if (!row?.revealed) {
    /* Deliberately the same answer whether the code is unknown or the initials
       are wrong. Distinguishing them would turn this endpoint into a way to
       discover that a certificate exists. */
    return json({ revealed: false });
  }

  return json({
    revealed: true,
    display_name: row.display_name,
    band: row.band,
    method: row.method,
  });
};

/** Anything other than POST. A GET with a code in the query string would put a
 *  certificate code into browser history, server logs and any proxy between —
 *  which is the one place a code identifying a child should never end up. */
export const GET: APIRoute = () =>
  json({ error: 'method_not_allowed',
    message: 'Verification is a POST, so codes stay out of URLs and logs.' }, 405);
