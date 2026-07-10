/** Progress sync — pushes the local ledger through award() and
 *  lesson_progress with the SAME client event ids, so replays are
 *  server-side no-ops (FR-AUTH-3 idempotent merge). Inert until Supabase
 *  is configured and the user is signed in. */
import { isConfigured, supabase } from './supabase';
import { load } from './progress-store';

export async function syncNow(): Promise<{ pushed: number } | { skipped: string }> {
  if (!isConfigured) return { skipped: 'not configured' };
  const sb = supabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { skipped: 'not signed in' };

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
  return { pushed };
}
