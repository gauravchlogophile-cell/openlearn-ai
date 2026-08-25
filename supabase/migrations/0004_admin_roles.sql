-- 0004 · Admin role model, delegation and an append-only audit log.
--
-- 0001 created public.user_roles with the note "role grants happen only via a
-- definer fn (later migration)" and deliberately shipped no insert/update/
-- delete policies. This is that migration.
--
-- Four layers, from the design:
--   super_admin  owners. Everything, including deletion, roles, money, policy.
--   admin        owns one surface end to end. PROPOSES deletions, never executes.
--   sub_admin    one specialist task, scoped to a function and time-boxed.
--   (volunteer)  not a row here at all — no admin surface, so no grant.
--
-- The existing reviewer/moderator/editor values are kept so nothing that
-- already relies on them breaks.

-- ---------------------------------------------------------------- role rows
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('reviewer','moderator','editor','admin','sub_admin','super_admin'));

-- A grant is scoped to a surface and may expire. "Set an end date. 90 days
-- default, renewable" — so expiry is data, not a calendar reminder someone
-- forgets.
alter table public.user_roles add column if not exists function text;
alter table public.user_roles add column if not exists expires_at timestamptz;
alter table public.user_roles add column if not exists reason text;

comment on column public.user_roles.function is
  'The surface this grant covers, e.g. "Curriculum & lessons". Never "all admin".';
comment on column public.user_roles.expires_at is
  'Access ends automatically when the task does. NULL = no expiry (owners, standing admins).';

-- No partial index here. `where expires_at > now()` looks natural and is
-- rejected: index predicates must be IMMUTABLE and now() is not, since the set
-- of matching rows would change without any write. Index the column instead
-- and let the planner filter.
create index if not exists user_roles_active
  on public.user_roles (user_id, role, expires_at);

-- ------------------------------------------------------------- audit log
-- "Who did what, when, from where, and why — for every layer, kept 24 months.
--  Owners can export it. Nobody, including owners, can edit it."
create table if not exists public.admin_audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor uuid references public.profiles(id) on delete set null,
  action text not null,
  target uuid references public.profiles(id) on delete set null,
  detail jsonb not null default '{}',
  reason text
);
comment on table public.admin_audit is
  'Append-only. There are deliberately no UPDATE or DELETE policies and the '
  'privileges are revoked below, so an owner cannot quietly rewrite history.';
create index if not exists admin_audit_at on public.admin_audit (at desc);

alter table public.admin_audit enable row level security;

-- ------------------------------------------------------------- helpers
-- has_role now ignores expired grants. Without this a time-boxed sub_admin
-- keeps their access forever, which makes the expiry column decorative — the
-- exact failure this model exists to prevent.
create or replace function public.has_role(wanted text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles
     where user_id = auth.uid()
       and role = wanted
       and (expires_at is null or expires_at > now())
  );
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles
     where user_id = auth.uid()
       and role = 'super_admin'
       and (expires_at is null or expires_at > now())
  );
$$;

-- Read the log: owners see everything, everyone else sees only rows about
-- themselves, so an admin can check what was done to their own account.
create policy "audit: owners read all, others read own" on public.admin_audit
  for select using (public.is_owner() or target = auth.uid() or actor = auth.uid());

-- ------------------------------------------------------------- granting
-- Only an owner grants or revokes, and every call writes an audit row in the
-- same transaction — so there is no code path that changes access without
-- leaving a trace.
create or replace function public.grant_role(
  p_user uuid, p_role text, p_function text default null,
  p_expires timestamptz default null, p_reason text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid();
begin
  if not public.is_owner() then
    raise exception 'grant_role: super_admin only';
  end if;
  if p_role = 'super_admin' then
    -- "Adding a fourth owner needs two existing owners." A single owner must
    -- not be able to mint another one, so this path goes through a proposal
    -- that a DIFFERENT owner confirms.
    raise exception 'grant_role: use propose_owner/confirm_owner for super_admin';
  end if;
  if p_role in ('admin','sub_admin') and coalesce(p_function, '') = '' then
    raise exception 'grant_role: % must name the surface it covers', p_role;
  end if;

  insert into user_roles (user_id, role, granted_by, function, expires_at, reason)
  values (p_user, p_role, v_actor, p_function, p_expires, p_reason)
  on conflict (user_id, role) do update
    set granted_by = v_actor, function = excluded.function,
        expires_at = excluded.expires_at, reason = excluded.reason,
        granted_at = now();

  insert into admin_audit (actor, action, target, detail, reason)
  values (v_actor, 'grant_role', p_user,
          jsonb_build_object('role', p_role, 'function', p_function, 'expires_at', p_expires),
          p_reason);
end $$;

create or replace function public.revoke_role(
  p_user uuid, p_role text, p_reason text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid();
begin
  if not public.is_owner() then
    raise exception 'revoke_role: super_admin only';
  end if;
  -- An owner may not remove the last owner, or the project locks itself out.
  if p_role = 'super_admin'
     and (select count(*) from user_roles
           where role = 'super_admin'
             and (expires_at is null or expires_at > now())) <= 1 then
    raise exception 'revoke_role: cannot remove the last super_admin';
  end if;

  delete from user_roles where user_id = p_user and role = p_role;

  insert into admin_audit (actor, action, target, detail, reason)
  values (v_actor, 'revoke_role', p_user, jsonb_build_object('role', p_role), p_reason);
end $$;

-- ------------------------------------------------------- the two-owner rule
create table if not exists public.owner_proposals (
  id bigserial primary key,
  target uuid not null references public.profiles(id) on delete cascade,
  proposed_by uuid not null references public.profiles(id) on delete cascade,
  proposed_at timestamptz not null default now(),
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  reason text
);
alter table public.owner_proposals enable row level security;
create policy "owner proposals: owners only" on public.owner_proposals
  for select using (public.is_owner());

create or replace function public.propose_owner(p_user uuid, p_reason text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid(); v_id bigint;
begin
  if not public.is_owner() then raise exception 'propose_owner: super_admin only'; end if;
  insert into owner_proposals (target, proposed_by, reason)
  values (p_user, v_actor, p_reason) returning id into v_id;
  insert into admin_audit (actor, action, target, detail, reason)
  values (v_actor, 'propose_owner', p_user, jsonb_build_object('proposal', v_id), p_reason);
  return v_id;
end $$;

create or replace function public.confirm_owner(p_proposal bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid(); v_p owner_proposals;
begin
  if not public.is_owner() then raise exception 'confirm_owner: super_admin only'; end if;
  select * into v_p from owner_proposals where id = p_proposal;
  if v_p.id is null then raise exception 'confirm_owner: no such proposal'; end if;
  if v_p.confirmed_at is not null then raise exception 'confirm_owner: already confirmed'; end if;
  -- The whole point: the second signature must be a different person.
  if v_p.proposed_by = v_actor then
    raise exception 'confirm_owner: a second owner must confirm, not the proposer';
  end if;

  update owner_proposals set confirmed_by = v_actor, confirmed_at = now() where id = p_proposal;
  insert into user_roles (user_id, role, granted_by) values (v_p.target, 'super_admin', v_actor)
    on conflict (user_id, role) do nothing;
  insert into admin_audit (actor, action, target, detail)
  values (v_actor, 'confirm_owner', v_p.target, jsonb_build_object('proposal', p_proposal));
end $$;

-- ------------------------------------------------------------- privileges
-- Same lesson as 0003: PostgreSQL grants EXECUTE to PUBLIC by default, so
-- revoking from anon alone leaves a function reachable over /rest/v1/rpc.
-- Revoke from PUBLIC first, then grant only what is needed.
revoke execute on function public.grant_role(uuid,text,text,timestamptz,text) from public, anon;
revoke execute on function public.revoke_role(uuid,text,text) from public, anon;
revoke execute on function public.propose_owner(uuid,text) from public, anon;
revoke execute on function public.confirm_owner(bigint) from public, anon;
revoke execute on function public.is_owner() from public, anon;
grant execute on function public.grant_role(uuid,text,text,timestamptz,text) to authenticated;
grant execute on function public.revoke_role(uuid,text,text) to authenticated;
grant execute on function public.propose_owner(uuid,text) to authenticated;
grant execute on function public.confirm_owner(bigint) to authenticated;
grant execute on function public.is_owner() to authenticated;

-- The audit log is append-only for everyone. No UPDATE/DELETE policy exists,
-- and the table privileges are removed as well so that even a future policy
-- cannot re-open the door by accident.
revoke insert, update, delete on public.admin_audit from anon, authenticated;
revoke update, delete on public.owner_proposals from anon, authenticated;
revoke insert, update, delete on public.user_roles from anon, authenticated;

-- Bootstrapping the first owner is deliberately NOT done here: this migration
-- runs in environments with no users, and hard-coding a uuid would put a real
-- person's id in version control. Set it once, as the project owner, with the
-- service role:
--
--   insert into public.user_roles (user_id, role)
--   values ('<auth.users.id>', 'super_admin');
--
-- After that, every further grant goes through the audited functions above.
