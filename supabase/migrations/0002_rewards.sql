-- 0002 · Reward ledger, balances, award() (Phase 6 §3.3) — the economy core.
create table public.reward_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('xp','coin')),
  amount int not null check (amount between -1000 and 1000),
  reason text not null,
  ref_slug text,
  client_event_id uuid unique,
  created_at timestamptz not null default now()
);
comment on table public.reward_events is 'Append-only ledger. Balances are DERIVED. client_event_id = offline-sync idempotency.';
create index reward_events_user_created on public.reward_events (user_id, created_at desc);

create table public.reward_balances (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  xp bigint not null default 0 check (xp >= 0),
  coins int not null default 0 check (coins >= 0),
  level int not null default 1,
  updated_at timestamptz not null default now()
);

create table public.lesson_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_slug text not null,
  content_hash text not null,
  status text not null default 'started' check (status in ('started','completed')),
  completed_at timestamptz,
  client_event_id uuid unique,
  primary key (user_id, lesson_slug)
);
comment on table public.lesson_progress is 'Progress keyed by slug+hash so content edits never corrupt history.';
create index lesson_progress_user_status on public.lesson_progress (user_id, status);

-- Level curve (gentle; tunable via gamification_config in a later migration)
create or replace function public.level_for_xp(total bigint)
returns int language sql immutable as $$
  select greatest(1, floor(sqrt(total::numeric / 25))::int + 1);
$$;

-- The ONLY mutation path for the economy (FR-GAME-1).
create or replace function public.award(
  p_kind text, p_amount int, p_reason text,
  p_ref_slug text default null, p_client_event_id uuid default null
) returns public.reward_balances
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_bal public.reward_balances;
  v_recent int;
begin
  if v_user is null then raise exception 'award: not authenticated'; end if;
  if p_kind not in ('xp','coin') then raise exception 'award: bad kind'; end if;
  if p_amount not between -1000 and 1000 then raise exception 'award: bad amount'; end if;

  -- Anti-farming: cap identical (reason, ref) awards to 1/day (server-side policy)
  select count(*) into v_recent from reward_events
   where user_id = v_user and reason = p_reason
     and coalesce(ref_slug,'') = coalesce(p_ref_slug,'')
     and created_at > now() - interval '1 day';
  if v_recent > 0 and p_amount > 0 then
    select * into v_bal from reward_balances where user_id = v_user;
    return v_bal;  -- silent no-op: repeat completions earn nothing (diminishing rule, Sprint 1 simple form)
  end if;

  -- Idempotency: duplicate client events are silent no-ops
  insert into reward_events (user_id, kind, amount, reason, ref_slug, client_event_id)
  values (v_user, p_kind, p_amount, p_reason, p_ref_slug, p_client_event_id)
  on conflict (client_event_id) do nothing;
  if not found then
    select * into v_bal from reward_balances where user_id = v_user;
    return v_bal;
  end if;

  insert into reward_balances (user_id, xp, coins)
  values (v_user, greatest(0, case when p_kind='xp' then p_amount else 0 end),
                  greatest(0, case when p_kind='coin' then p_amount else 0 end))
  on conflict (user_id) do update set
    xp = greatest(0, reward_balances.xp + case when p_kind='xp' then p_amount else 0 end),
    coins = greatest(0, reward_balances.coins + case when p_kind='coin' then p_amount else 0 end),
    level = public.level_for_xp(greatest(0, reward_balances.xp + case when p_kind='xp' then p_amount else 0 end)),
    updated_at = now();

  select * into v_bal from reward_balances where user_id = v_user;
  return v_bal;
end $$;

-- RLS: read own; NO direct writes for anyone (function-only path)
alter table public.reward_events enable row level security;
alter table public.reward_balances enable row level security;
alter table public.lesson_progress enable row level security;

create policy "reward_events: read own" on public.reward_events
  for select using (user_id = auth.uid() or public.has_role('admin'));
create policy "reward_balances: read own" on public.reward_balances
  for select using (user_id = auth.uid() or public.has_role('admin'));

create policy "lesson_progress: read own" on public.lesson_progress
  for select using (user_id = auth.uid());
create policy "lesson_progress: upsert own" on public.lesson_progress
  for insert with check (user_id = auth.uid());
create policy "lesson_progress: update own" on public.lesson_progress
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

grant execute on function public.award(text,int,text,text,uuid) to authenticated;
revoke execute on function public.award(text,int,text,text,uuid) from anon;
