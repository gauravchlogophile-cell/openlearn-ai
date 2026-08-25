-- pgTAP tests for the admin role model (migration 0004).
-- Run: supabase test db
--
-- These assert the properties the model exists to guarantee. A role system
-- that is merely "probably right" is worth very little, because every bug in
-- it is a privilege-escalation bug.
begin;
select plan(18);

-- ------------------------------------------------------------- structure
select has_table('public', 'admin_audit', 'admin_audit exists');
select has_table('public', 'owner_proposals', 'owner_proposals exists');
select has_column('public', 'user_roles', 'expires_at', 'grants can be time-boxed');
select has_column('public', 'user_roles', 'function', 'grants name their surface');

select ok((select relrowsecurity from pg_class where relname = 'admin_audit' and relnamespace = 'public'::regnamespace),
  'RLS on admin_audit');
select ok((select relrowsecurity from pg_class where relname = 'owner_proposals' and relnamespace = 'public'::regnamespace),
  'RLS on owner_proposals');

-- The audit log must be append-only: no policy may allow rewriting history.
select is(
  (select count(*)::int from pg_policies
    where tablename='admin_audit' and cmd in ('UPDATE','DELETE')),
  0, 'audit log has zero UPDATE/DELETE policies');

-- ------------------------------------------------------------- privileges
-- 0003 exists because `revoke ... from anon` alone leaves PUBLIC's default
-- grant intact. Assert the fix held for the new functions too.
select ok(
  not has_function_privilege('anon', 'public.grant_role(uuid,text,text,timestamptz,text)', 'EXECUTE'),
  'anon cannot execute grant_role');
select ok(
  not has_function_privilege('anon', 'public.revoke_role(uuid,text,text)', 'EXECUTE'),
  'anon cannot execute revoke_role');
select ok(
  not has_function_privilege('anon', 'public.confirm_owner(bigint)', 'EXECUTE'),
  'anon cannot execute confirm_owner');
select ok(
  not has_table_privilege('authenticated', 'public.user_roles', 'INSERT'),
  'authenticated cannot insert roles directly — functions are the only path');
select ok(
  not has_table_privilege('authenticated', 'public.admin_audit', 'INSERT'),
  'authenticated cannot write audit rows directly');

select ok((select prosecdef from pg_proc where proname = 'grant_role' and pronamespace = 'public'::regnamespace),
  'grant_role is SECURITY DEFINER');

-- ------------------------------------------------------------- behaviour
-- Expired grants must stop counting, or the expiry column is decorative.
select ok(
  (select prosrc like '%expires_at%' from pg_proc where proname = 'has_role' and pronamespace = 'public'::regnamespace),
  'has_role accounts for expiry');

-- A caller with no role at all must be refused.
select throws_ok(
  $$ select public.grant_role('00000000-0000-0000-0000-000000000001'::uuid, 'admin', 'Curriculum') $$,
  'grant_role: super_admin only',
  'a non-owner cannot grant a role');

-- The two-owner rule: the person confirming must not be the person who
-- proposed, or a single owner can mint themselves a second one.
select ok(
  (select prosrc like '%proposed_by = v_actor%' from pg_proc where proname = 'confirm_owner' and pronamespace = 'public'::regnamespace),
  'confirm_owner refuses self-confirmation');

-- An owner must not be able to remove the last owner and lock the project out
-- of its own administration.
select ok(
  (select prosrc like '%cannot remove the last super_admin%' from pg_proc where proname = 'revoke_role' and pronamespace = 'public'::regnamespace),
  'revoke_role protects the last owner');

-- Owners are minted only through propose/confirm, never grant_role.
select ok(
  (select prosrc like '%use propose_owner/confirm_owner%' from pg_proc where proname = 'grant_role' and pronamespace = 'public'::regnamespace),
  'grant_role routes super_admin through the two-owner path');

select * from finish();
rollback;
