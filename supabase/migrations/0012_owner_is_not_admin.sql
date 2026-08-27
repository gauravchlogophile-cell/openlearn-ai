-- 0012 · A super_admin is not an 'admin', and four policies assumed otherwise.
--
-- has_role('admin') tests for the literal role 'admin'. A super_admin does not
-- hold it — 0004 made them separate layers on purpose, so that "owns one
-- surface" and "owns everything" are distinguishable. That was right.
--
-- What was wrong is that four RLS policies written before 0004 gate on
-- has_role('admin') alone. The owner therefore reads none of them, and the
-- admin console silently degrades in ways that look like unrelated bugs:
--
--   profiles         the owner sees only their own row, so every name in
--                    /admin/people and /admin renders as a uuid fragment
--   user_roles       the owner sees only their OWN grant, so the "who holds
--                    what" table can never show anyone else — the exact screen
--                    you would open to check whether a volunteer's grant landed
--   reward_events    the owner cannot audit the economy they are accountable for
--   reward_balances  same
--
-- Found by querying each table as the owner through the `authenticated` role
-- rather than by reading the code: user_roles returned 1 row when 1 grant
-- exists, which looks correct until a second person is granted and it still
-- returns 1.
--
-- 0006's decisions policy already had this right — `is_owner() or
-- has_role('admin')` — which is what makes the omission in the older four a
-- slip rather than a decision.
--
-- Deliberately NOT changed: credentials, attempts and certificate_names stay
-- `learner_id = auth.uid()`. An owner has no business browsing what a learner
-- scored, and 10f is explicit that a reviewer never sees a name. Authority over
-- the system is not authority over a child's result.

drop policy if exists "profiles: read own or public" on public.profiles;
create policy "profiles: read own or public" on public.profiles
  for select
  using (id = auth.uid() or profile_public
         or public.has_role('admin') or public.is_owner());

drop policy if exists "roles: read own" on public.user_roles;
create policy "roles: read own" on public.user_roles
  for select
  using (user_id = auth.uid()
         or public.has_role('admin') or public.is_owner());

drop policy if exists "reward_events: read own" on public.reward_events;
create policy "reward_events: read own" on public.reward_events
  for select
  using (user_id = auth.uid()
         or public.has_role('admin') or public.is_owner());

drop policy if exists "reward_balances: read own" on public.reward_balances;
create policy "reward_balances: read own" on public.reward_balances
  for select
  using (user_id = auth.uid()
         or public.has_role('admin') or public.is_owner());

comment on table public.user_roles is
  'Role grants. Readable by the holder, by an admin, and by an owner — the last '
  'of those was missing until 0012, which meant the owner could not see anyone '
  'else''s grant on the page built to show exactly that.';

-- ------------------------------------------------- granting from the console

/** Find the account behind an email address, so a role can be granted by
 *  typing the address rather than by pasting a uuid.
 *
 *  Owner-only, and that is not caution for its own sake: an endpoint that says
 *  whether an address has an account is an account-enumeration oracle, and most
 *  of these accounts belong to children. Returns null rather than raising when
 *  there is no match, so the caller can tell the operator "no account yet"
 *  without the function having to distinguish absence from error.
 *
 *  Exists because /admin/people had no way to grant a role at all — the whole
 *  point of the four-layer model is handing a surface to somebody, and doing
 *  that required a SQL console until now.
 */
create or replace function public.user_id_for_email(p_email text)
returns uuid language plpgsql stable security definer
set search_path = pg_catalog, public, auth as $$
declare v_id uuid;
begin
  if not public.is_owner() then
    raise exception 'user_id_for_email: owners only';
  end if;
  select id into v_id from auth.users
   where lower(email) = lower(btrim(p_email)) limit 1;
  return v_id;
end $$;

revoke execute on function public.user_id_for_email(text) from public, anon;
grant  execute on function public.user_id_for_email(text) to authenticated, service_role;
