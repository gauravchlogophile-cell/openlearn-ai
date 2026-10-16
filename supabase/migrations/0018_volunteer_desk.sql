-- 0018 · The volunteer desk.
--
-- The owner gave a volunteer a role from /admin/people, the grant was written
-- correctly, and the volunteer still could not do anything: the admin console let
-- in only an owner or an admin, and "editor" had no surface of its own. A role
-- that opens nothing is worse than no role, because it looks like it worked.
--
-- This adds what was missing, and nothing else:
--
--   · a fourth volunteer role, "translator", for the people who will review
--     translations (the owner decided on 16 October 2026 that no machine
--     translation goes live until a person has read it)
--   · my_roles() and is_staff(), so the console can ask the database what the
--     person signed in holds, and show them only what that role is for
--   · grant_volunteer_role() / revoke_volunteer_role(), so an ADMIN (not only an
--     owner) can assign the four volunteer roles from the user portal. They are
--     narrower than grant_role(): volunteer roles only, a stated purpose, an end
--     date within a year, never to oneself. Admin, sub-admin and owner stay with
--     the owner, as before.
--
-- Nothing here widens what any role can read or write. A volunteer role still
-- matches only the policies that already name it.

alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('reviewer','moderator','editor','translator','admin','sub_admin','super_admin'));

-- ---------------------------------------------------------------- who am I
create or replace function public.my_roles()
returns table (role text, function text, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select ur.role, ur.function, ur.expires_at
    from user_roles ur
   where ur.user_id = auth.uid()
     and (ur.expires_at is null or ur.expires_at > now())
   order by ur.granted_at;
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles
     where user_id = auth.uid() and (expires_at is null or expires_at > now())
  );
$$;

-- ------------------------------------------------ assigning volunteer roles
create or replace function public.grant_volunteer_role(
  p_user uuid, p_role text, p_function text, p_expires timestamptz, p_reason text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null or not (public.is_owner() or public.has_role('admin')) then
    raise exception 'grant_volunteer_role: an admin or an owner only';
  end if;
  if p_role not in ('reviewer','moderator','editor','translator') then
    raise exception 'grant_volunteer_role: volunteer roles only (reviewer, moderator, editor, translator). Admin and sub-admin are granted by an owner.';
  end if;
  if p_user = v_actor then
    raise exception 'grant_volunteer_role: you cannot give a role to yourself';
  end if;
  if coalesce(btrim(p_function), '') = '' then
    raise exception 'grant_volunteer_role: say what this person will do, so the grant is legible to them and to everyone else';
  end if;
  if p_expires is null or p_expires > now() + interval '366 days' or p_expires <= now() then
    raise exception 'grant_volunteer_role: a volunteer role ends within a year; set an end date in the future';
  end if;
  if not exists (select 1 from profiles where id = p_user) then
    raise exception 'grant_volunteer_role: no such person. They need to sign in to Lrnon once first.';
  end if;

  insert into user_roles (user_id, role, granted_by, function, expires_at, reason)
  values (p_user, p_role, v_actor, btrim(p_function), p_expires, p_reason)
  on conflict (user_id, role) do update
    set granted_by = v_actor, function = excluded.function,
        expires_at = excluded.expires_at, reason = excluded.reason, granted_at = now();

  insert into admin_audit (actor, action, target, detail, reason)
  values (v_actor, 'grant_volunteer_role', p_user,
          jsonb_build_object('role', p_role, 'function', btrim(p_function), 'expires_at', p_expires), p_reason);
end $$;

create or replace function public.revoke_volunteer_role(
  p_user uuid, p_role text, p_reason text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null or not (public.is_owner() or public.has_role('admin')) then
    raise exception 'revoke_volunteer_role: an admin or an owner only';
  end if;
  if p_role not in ('reviewer','moderator','editor','translator') then
    raise exception 'revoke_volunteer_role: volunteer roles only. Admin and owner roles are removed by an owner.';
  end if;
  delete from user_roles where user_id = p_user and role = p_role;
  insert into admin_audit (actor, action, target, detail, reason)
  values (v_actor, 'revoke_volunteer_role', p_user, jsonb_build_object('role', p_role), p_reason);
end $$;

-- Same lesson as 0003 and 0004: EXECUTE goes to PUBLIC by default.
revoke execute on function public.my_roles() from public, anon;
revoke execute on function public.is_staff() from public, anon;
revoke execute on function public.grant_volunteer_role(uuid,text,text,timestamptz,text) from public, anon;
revoke execute on function public.revoke_volunteer_role(uuid,text,text) from public, anon;
grant execute on function public.my_roles() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.grant_volunteer_role(uuid,text,text,timestamptz,text) to authenticated;
grant execute on function public.revoke_volunteer_role(uuid,text,text) to authenticated;
