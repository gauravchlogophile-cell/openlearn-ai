-- pgTAP for 0018 — the volunteer desk.
--
-- A volunteer given a role must be able to see that they hold it, and an admin
-- (not only an owner) must be able to give the four volunteer roles, and nothing
-- more. What matters is the edges: not admin, not to oneself, not forever.
begin;
select plan(9);

select ok(exists (select 1 from pg_constraint where conname = 'user_roles_role_check'
                   and pg_get_constraintdef(oid) like '%translator%'),
  'the language reviewer (translator) role is allowed');

select ok(not has_function_privilege('anon', 'public.grant_volunteer_role(uuid, text, text, timestamptz, text)', 'execute')
      and not has_function_privilege('anon', 'public.revoke_volunteer_role(uuid, text, text)', 'execute'),
  'an anonymous visitor cannot assign or end a volunteer role');

select ok(not has_function_privilege('anon', 'public.my_roles()', 'execute')
      and not has_function_privilege('anon', 'public.is_staff()', 'execute'),
  'an anonymous visitor cannot ask what roles exist');

select ok(has_function_privilege('authenticated', 'public.my_roles()', 'execute'),
  'a signed-in person can ask what they hold');

select ok((select prosecdef from pg_proc where proname = 'grant_volunteer_role'),
  'granting runs as the definer, so the caller needs no write access to user_roles');

select ok(pg_get_functiondef('public.grant_volunteer_role(uuid, text, text, timestamptz, text)'::regprocedure) like '%volunteer roles only%',
  'it refuses admin, sub-admin and owner');

select ok(pg_get_functiondef('public.grant_volunteer_role(uuid, text, text, timestamptz, text)'::regprocedure) like '%cannot give a role to yourself%',
  'it refuses a grant to oneself');

select ok(pg_get_functiondef('public.grant_volunteer_role(uuid, text, text, timestamptz, text)'::regprocedure) like '%366 days%',
  'it refuses a grant with no end or an end more than a year away');

select ok(pg_get_functiondef('public.grant_volunteer_role(uuid, text, text, timestamptz, text)'::regprocedure) like '%admin_audit%',
  'every grant is written to the audit log');

select * from finish();
rollback;
