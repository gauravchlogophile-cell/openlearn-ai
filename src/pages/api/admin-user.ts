import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

/**
 * POST /api/admin-user — suspend, restore, or sign out a learner.
 *
 * Everything else in the user portal is a read through row-level security and
 * definer functions. These three actions are the ones that need the auth admin
 * API, which only the service role may call, so they pass through the Worker.
 *
 * The order matters and every step fails closed:
 *   1. the caller's own token is verified by the database (never parsed here)
 *   2. the database is asked, as that caller, whether they are an owner or admin
 *   3. only then does the service role do anything
 *   4. every action is written to admin_audit with the caller as the actor
 *
 * Reserved to an owner, as the console says: nobody can suspend an owner, an
 * admin cannot suspend another admin, and nobody can suspend themselves. Deleting
 * an account is not here at all; it goes through the decisions queue, where a
 * second owner must approve it.
 */
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any)?.runtime?.env;
  const url = env?.PUBLIC_SUPABASE_URL ?? import.meta.env.PUBLIC_SUPABASE_URL;
  const anon = env?.PUBLIC_SUPABASE_ANON_KEY ?? import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  const service = env?.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) return json({ error: 'not_configured' }, 503);

  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'sign_in_required' }, 401);

  let body: { user?: unknown; action?: unknown; reason?: unknown };
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const target = typeof body.user === 'string' && /^[0-9a-f-]{36}$/i.test(body.user) ? body.user : '';
  const action = String(body.action);
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : '';
  if (!target || !['suspend', 'restore', 'sign_out'].includes(action)) return json({ error: 'bad_request' }, 400);
  if (action === 'suspend' && reason.length < 5) return json({ error: 'reason_required', message: 'Say why, in a few words. It is recorded.' }, 400);

  // 1 + 2: who is this, and what are they, according to the database.
  const asCaller = createClient(url, anon, { global: { headers: { authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: who, error: whoErr } = await asCaller.auth.getUser(token);
  if (whoErr || !who.user) return json({ error: 'sign_in_required' }, 401);
  const [{ data: owner }, { data: admin }] = await Promise.all([asCaller.rpc('is_owner'), asCaller.rpc('has_role', { wanted: 'admin' })]);
  if (!owner && !admin) return json({ error: 'forbidden' }, 403);
  if (who.user.id === target) return json({ error: 'not_yourself', message: 'You cannot do this to your own account.' }, 400);

  const db = createClient(url, service, { auth: { persistSession: false } });

  // Who is the target? An owner is untouchable; an admin can be touched only by an owner.
  const { data: roles } = await db.from('user_roles').select('role').eq('user_id', target);
  const held = new Set((roles ?? []).map((r: any) => r.role));
  if (held.has('super_admin')) return json({ error: 'protected', message: 'An owner cannot be suspended here.' }, 403);
  if ((held.has('admin') || held.has('sub_admin')) && !owner) return json({ error: 'owner_only', message: 'Only an owner can do this to an admin.' }, 403);

  try {
    if (action === 'suspend') {
      const { error } = await db.auth.admin.updateUserById(target, { ban_duration: '876000h' });
      if (error) throw error;
      await db.auth.admin.signOut(target, 'global').catch(() => {});
    } else if (action === 'restore') {
      const { error } = await db.auth.admin.updateUserById(target, { ban_duration: 'none' });
      if (error) throw error;
    } else {
      await db.auth.admin.signOut(target, 'global');
    }
    await db.rpc('log_admin_action', { p_actor: who.user.id, p_action: `user_${action}`, p_target: target, p_detail: { via: 'api/admin-user' }, p_reason: reason || null });
    return json({ ok: true });
  } catch (e: any) {
    return json({ error: 'failed', message: String(e?.message ?? e).slice(0, 200) }, 500);
  }
};
