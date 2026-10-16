import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

/**
 * POST /api/hit — an anonymous page count.
 *
 * Receives { path, device, via } and adds one to a counter keyed by day, path,
 * device class, country and share channel. That is everything it keeps.
 *
 * What it deliberately does not do, because the privacy page promises it:
 *   · it does not read, hash or store the IP address. The country comes from the
 *     two-letter header Cloudflare already attaches; the address itself is never
 *     looked at.
 *   · it does not read the User-Agent. The device class comes from the browser's
 *     own report of its window width, in the body.
 *   · it sets no cookie and reads none, so there is no visitor and no session to
 *     count: two visits by one person are two hits, and a page count cannot be
 *     turned into a person.
 *   · it honours Do Not Track and Global Privacy Control by counting nothing.
 *
 * It always answers 204, whether it counted or not, so the page never learns
 * anything from it and a failure is invisible to a reader.
 */
const done = () => new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });

export const POST: APIRoute = async ({ request, locals }) => {
  /* Answer first, count afterwards. The count is a database round trip and a cold
     Worker start, which took over a second; nothing about the page depends on it,
     so the response is sent at once and the write finishes behind it. */
  const ctx = (locals as any)?.runtime?.ctx;
  let work: Promise<unknown> = Promise.resolve();
  try {
    if (request.headers.get('dnt') === '1' || request.headers.get('sec-gpc') === '1') return done();

    const env = (locals as any)?.runtime?.env;
    const url = env?.PUBLIC_SUPABASE_URL ?? import.meta.env.PUBLIC_SUPABASE_URL;
    const key = env?.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return done();                       // not configured: count nothing, say nothing

    let body: { path?: unknown; device?: unknown; via?: unknown } = {};
    try { body = await request.json(); } catch { return done(); }

    const path = typeof body.path === 'string' ? body.path.slice(0, 120) : '';
    // Never count the admin console, the API, or anything that is not a page.
    if (!path.startsWith('/') || /^\/(admin|api)(\/|$)/.test(path) || /\.[a-z0-9]{2,5}$/i.test(path)) return done();

    const device = ['mobile', 'tablet', 'desktop'].includes(String(body.device)) ? String(body.device) : 'unknown';
    const via = typeof body.via === 'string' && /^[a-z0-9-]{1,24}$/.test(body.via) ? body.via : '';
    const country = (request.headers.get('cf-ipcountry') ?? '').toUpperCase();

    const db = createClient(url, key, { auth: { persistSession: false } });
    work = Promise.resolve(db.rpc('record_hit', { p_path: path, p_device: device, p_country: country, p_via: via })).catch(() => {});
  } catch { /* a counter must never break a page */ }
  if (typeof ctx?.waitUntil === 'function') ctx.waitUntil(work); else await work;
  return done();
};
