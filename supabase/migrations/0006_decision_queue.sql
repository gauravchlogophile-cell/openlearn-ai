-- 0006 · The decision queue and the Sky rollout log.
--
-- From design turn 9b: "everything that enters, stays, changes or leaves Lrnon
-- lands in their queue by default". Four kinds, oldest first, and nothing sits
-- longer than seven days without a nudge.
--
-- The load-bearing rule from 9a is that some actions cannot be delegated at
-- all. An Admin owns a surface and PROPOSES deletion; only an owner executes
-- it. That is enforced here in the function, not in the console — a UI check
-- is a suggestion, and this is a raise exception.

create table if not exists public.decisions (
  id           bigserial primary key,
  kind         text not null check (kind in ('goes_in','changes','stays','deletion')),
  title        text not null check (char_length(title) between 3 and 200),
  detail       text,
  -- What this decision is about, so a decided row still makes sense later.
  ref          text,
  raised_by    uuid references public.profiles(id) on delete set null,
  raised_at    timestamptz not null default now(),
  decided_by   uuid references public.profiles(id) on delete set null,
  decided_at   timestamptz,
  outcome      text check (outcome in ('approved','rejected','deferred')),
  outcome_note text
);

comment on table public.decisions is
  'Owner/admin work queue. Deletions are reserved to super_admin and that is '
  'enforced in decide(), not in the console.';

create index if not exists decisions_open on public.decisions (raised_at)
  where decided_at is null;

alter table public.decisions enable row level security;

-- Any administrator can see the queue; that is the point of a shared queue.
create policy "decisions: administrators read"
  on public.decisions for select
  using (public.is_owner() or public.has_role('admin'));

-- No direct writes. Raising and deciding both go through functions so every
-- one of them lands in the audit log with a name against it.
revoke insert, update, delete on public.decisions from anon, authenticated;

/** Anyone with an admin surface may RAISE anything, including a deletion —
 *  proposing is not deciding. */
create or replace function public.raise_decision(
  p_kind text, p_title text, p_detail text default null, p_ref text default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid(); v_id bigint;
begin
  if not (public.is_owner() or public.has_role('admin') or public.has_role('sub_admin')) then
    raise exception 'raise_decision: administrators only';
  end if;
  insert into decisions (kind, title, detail, ref, raised_by)
  values (p_kind, p_title, p_detail, p_ref, v_actor) returning id into v_id;
  insert into admin_audit (actor, action, detail)
  values (v_actor, 'raise_decision', jsonb_build_object('decision', v_id, 'kind', p_kind));
  return v_id;
end $$;

/** Deciding is where the layers bite.
 *
 *  Reserved to Super Admin, per the design, and therefore reserved here:
 *  deleting content, accounts or data. An Admin proposing a deletion is
 *  normal; an Admin executing one is the thing this prevents. */
create or replace function public.decide(
  p_decision bigint, p_outcome text, p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid(); v_kind text; v_done timestamptz;
begin
  select kind, decided_at into v_kind, v_done from decisions where id = p_decision;
  if v_kind is null then raise exception 'decide: no such decision'; end if;
  if v_done is not null then raise exception 'decide: already decided'; end if;

  if v_kind = 'deletion' then
    if not public.is_owner() then
      raise exception 'decide: deletions are reserved to super_admin';
    end if;
  elsif not (public.is_owner() or public.has_role('admin')) then
    raise exception 'decide: administrators only';
  end if;

  update decisions
     set outcome = p_outcome, outcome_note = p_note,
         decided_by = v_actor, decided_at = now()
   where id = p_decision;

  insert into admin_audit (actor, action, detail, reason)
  values (v_actor, 'decide',
          jsonb_build_object('decision', p_decision, 'kind', v_kind, 'outcome', p_outcome), p_note);
end $$;

revoke execute on function public.raise_decision(text,text,text,text) from public, anon;
revoke execute on function public.decide(bigint,text,text) from public, anon;
grant  execute on function public.raise_decision(text,text,text,text) to authenticated;
grant  execute on function public.decide(bigint,text,text) to authenticated;

-- ------------------------------------------------------- Sky rollout log
-- Turn 8d: "Every flip is logged with who, when, and why."
--
-- The live flag itself lives in KV rather than here, because the design
-- requires a kill switch that takes effect in about 30 seconds with no deploy,
-- and a Postgres read on every page request would not be that. This table is
-- the permanent record of who changed it and why; KV holds the current value.
create table if not exists public.sky_rollout_log (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  actor      uuid references public.profiles(id) on delete set null,
  mode       text not null check (mode in ('off','staff','slice','everyone')),
  reason     text,
  kill_switch boolean not null default false
);

alter table public.sky_rollout_log enable row level security;
create policy "sky log: administrators read"
  on public.sky_rollout_log for select
  using (public.is_owner() or public.has_role('admin'));
revoke insert, update, delete on public.sky_rollout_log from anon, authenticated;

/** Turning Sky on for everyone needs a second owner, exactly as adding an
 *  owner does. Turning it OFF needs nobody — a kill switch that requires
 *  approval is not a kill switch. */
create or replace function public.set_sky_mode(
  p_mode text, p_reason text default null, p_kill boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid();
begin
  if p_mode = 'off' or p_kill then
    -- Anyone with an admin surface may pull the cord, immediately.
    if not (public.is_owner() or public.has_role('admin')) then
      raise exception 'set_sky_mode: administrators only';
    end if;
  elsif p_mode = 'everyone' then
    if not public.is_owner() then
      raise exception 'set_sky_mode: only a super_admin may widen Sky to everyone';
    end if;
  else
    if not public.is_owner() then
      raise exception 'set_sky_mode: super_admin only';
    end if;
  end if;

  insert into sky_rollout_log (actor, mode, reason, kill_switch)
  values (v_actor, p_mode, p_reason, p_kill);
  insert into admin_audit (actor, action, detail, reason)
  values (v_actor, 'set_sky_mode', jsonb_build_object('mode', p_mode, 'kill', p_kill), p_reason);
end $$;

revoke execute on function public.set_sky_mode(text,text,boolean) from public, anon;
grant  execute on function public.set_sky_mode(text,text,boolean) to authenticated;
