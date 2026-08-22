-- 0003 · Function privilege hardening.
--
-- 0002 tried to lock down award() with `revoke ... from anon`, but that is not
-- enough: PostgreSQL grants EXECUTE on new functions to the PUBLIC pseudo-role
-- by default, and anon inherits it through PUBLIC. The revoke removed anon's
-- direct grant while the PUBLIC grant kept the function reachable over
-- /rest/v1/rpc. Every definer function below was exposed the same way.
--
-- Rule from here on: revoke from PUBLIC first, then grant to the exact roles
-- that need it.

-- award(): the only mutation path for the economy. Signed-in learners only.
revoke execute on function public.award(text,int,text,text,uuid) from public, anon;
grant  execute on function public.award(text,int,text,text,uuid) to authenticated, service_role;

-- handle_new_user(): a trigger function. Nothing should call it over the API.
-- (Trigger execution checks EXECUTE at CREATE TRIGGER time, not at fire time,
--  so the on_auth_user_created trigger keeps working after this revoke.)
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- rls_auto_enable(): event-trigger helper. Same reasoning.
--
-- Guarded, because this one is NOT created by our migrations: it is installed
-- by Supabase's hosted platform, so it exists on the remote project but never
-- in a local `supabase start` stack. An unguarded revoke therefore aborts the
-- whole local migration replay with 42883, which is exactly what it did to CI.
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;

-- has_role(): stays callable by both API roles on purpose — the RLS policies on
-- profiles, user_roles, reward_events and reward_balances call it, and policy
-- expressions are evaluated as the querying role. It discloses only whether the
-- *caller* holds a role, so it leaks nothing. Drop the PUBLIC grant and name the
-- two roles explicitly.
revoke execute on function public.has_role(text) from public;
grant  execute on function public.has_role(text) to anon, authenticated, service_role;

-- level_for_xp(): pin search_path so the resolution of sqrt/floor/greatest can
-- never be hijacked by a schema earlier on a caller's search_path.
alter function public.level_for_xp(bigint) set search_path = pg_catalog, public;
revoke execute on function public.level_for_xp(bigint) from public, anon;
grant  execute on function public.level_for_xp(bigint) to authenticated, service_role;
