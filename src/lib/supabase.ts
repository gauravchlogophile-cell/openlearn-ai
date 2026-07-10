/** Supabase client — auth foundation (Sprint 2). Local-first by design:
 *  everything works with no backend configured; when PUBLIC_SUPABASE_* env
 *  vars exist, sign-in and progress sync activate. */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const anon = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anon);

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!isConfigured) throw new Error('Supabase is not configured (local-only mode).');
  return (client ??= createClient(url!, anon!));
}
