/** Progress sync — pushes the local ledger through award() and
 *  lesson_progress with the SAME client event ids, so replays are
 *  server-side no-ops (FR-AUTH-3 idempotent merge). Also pulls existing
 *  server-side progress down first, so a fresh device (no local history)
 *  correctly catches up to an account's prior progress before pushing.
 *  Inert until Supabase is configured and the user is signed in. */
import { isConfigured, supabase } from './supabase';
import { load, mergeFromServer } from './progress-store';

export async function syncNow(): Promise<{ pulled: number; pushed: number } | { skipped: string }> {
  if (!isConfigured) return { skipped: 'not configured' };
  const sb = supabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { skipped: 'not signed in' };

  // 1. Pull first, so a fresh device catches up to this account's server state.
  const [{ data: serverEvents, error: evErr }, { data: serverCompletions, error: coErr }] = await Promise.all([
    sb.from('reward_events')
      .select('client_event_id, kind, amount, reason, ref_slug, created_at')
      .eq('user_id', user.id).not('client_event_id', 'is', null),
    sb.from('lesson_progress')
      .select('lesson_slug, content_hash, completed_at')
      .eq('user_id', user.id).eq('status', 'completed'),
  ]);

  let pulled = 0;
  if (!evErr && !coErr) {
    const events = (serverEvents ?? []).map((e) => ({
      id: e.client_event_id as string, kind: e.kind as 'xp', amount: e.amount as number,
      reason: e.reason as string, ref: (e.ref_slug ?? '') as string, at: e.created_at as string,
    }));
    const completions: Record<string, { hash: string; at: string }> = {};
    for (const c of serverCompletions ?? []) {
      completions[c.lesson_slug as string] = { hash: c.content_hash as string, at: c.completed_at as string };
    }
    pulled = mergeFromServer(events, completions);
  }

  // 2. Then push whatever the (now-merged) local ledger has that the server doesn't.
  const state = load();
  let pushed = 0;
  for (const e of state.events) {
    const { error } = await sb.rpc('award', {
      p_kind: e.kind, p_amount: e.amount, p_reason: e.reason,
      p_ref_slug: e.ref, p_client_event_id: e.id,
    });
    if (!error) pushed += 1;                    // duplicates no-op server-side
  }
  for (const [slug, c] of Object.entries(state.completions)) {
    await sb.from('lesson_progress').upsert({
      user_id: user.id, lesson_slug: slug, content_hash: c.hash,
      status: 'completed', completed_at: c.at,
    });
  }
  return { pulled, pushed };
}
