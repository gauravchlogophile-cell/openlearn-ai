-- 0013 · A spend cap that cannot be outrun.
--
-- /api/sky's own comment is the specification for this file:
--
--   "A hard cap needs a Durable Object (single-threaded, strongly consistent)
--    ... It must NOT stay this way once Sky can spend money — treat this as a
--    prerequisite of enabling Sky, not a follow-up, since this is the only
--    control standing between an abusive client and an unbounded provider
--    bill."
--
-- The KV limiter it describes is a read-modify-write over an eventually
-- consistent store. Two requests both read 5, both write 6; a client spraying
-- through several PoPs reads a stale count for seconds. Fine for shaping
-- traffic, useless for bounding money.
--
-- A Durable Object would work. So does the database already sitting here, and
-- it has two advantages: the check and the increment are ONE statement under a
-- row lock, so there is no window to race; and the spend becomes queryable
-- history rather than a counter that resets into the void.
--
-- Reserve-then-settle, because the honest order matters. The reservation takes
-- the WORST case (max_tokens) before the provider is called, and settlement
-- corrects it to what was actually used. Reserving the estimate afterwards
-- would mean a burst of concurrent calls all pass the check and the bill
-- arrives anyway — the exact failure this replaces.

create table if not exists public.sky_budget (
  id                smallint primary key default 1 check (id = 1),
  daily_token_cap   bigint  not null default 200000,
  daily_call_cap    int     not null default 500,
  per_call_max_tokens int   not null default 800,
  enabled           boolean not null default true,
  note              text,
  updated_at        timestamptz not null default now()
);

insert into public.sky_budget (id, note)
values (1, 'Ships with a deliberately small cap. Sky is the first recurring '
         || 'cost on a project whose README promises "Free forever", so the '
         || 'default is a number that cannot hurt if something goes wrong at '
         || '3am. Raise it once real usage is known — never before.')
on conflict (id) do nothing;

comment on table public.sky_budget is
  'One row. The ceiling on what Sky may spend in a day, enforced by '
  'sky_reserve() under a row lock rather than by a KV counter that a burst can '
  'outrun.';

create table if not exists public.sky_spend (
  id            bigserial primary key,
  day           date not null default (now() at time zone 'utc')::date,
  reserved_at   timestamptz not null default now(),
  settled_at    timestamptz,
  input_tokens  int not null default 0,
  output_tokens int not null default 0,
  reserved_tokens int not null,
  provider      text,
  model         text,
  ok            boolean
);

create index if not exists sky_spend_day on public.sky_spend (day);

comment on table public.sky_spend is
  'One row per provider call, reserved before the call and settled after. '
  'Never contains a learner''s question or the answer — this is an accounting '
  'record, and a table of what children asked an assistant is not a thing to '
  'keep for accounting.';

/** Reserve budget for one call, or refuse.
 *
 *  The whole point is that the check and the increment cannot be separated.
 *  `select ... for update` takes a row lock on the single budget row, so
 *  concurrent callers queue rather than all reading the same stale total. A
 *  request that would cross the cap is refused before the provider is called,
 *  which is the only moment refusing is free.
 */
create or replace function public.sky_reserve(p_max_tokens int)
returns table (allowed boolean, reservation bigint, reason text,
               tokens_left bigint, calls_left int)
language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
declare
  b public.sky_budget%rowtype;
  v_today date := (now() at time zone 'utc')::date;
  v_tokens bigint;
  v_calls int;
  v_id bigint;
  v_want int;
begin
  -- The lock. Everything below is serialised behind it.
  select * into b from public.sky_budget where id = 1 for update;
  if b.id is null then
    return query select false, null::bigint, 'no budget row'::text, 0::bigint, 0; return;
  end if;
  if not b.enabled then
    return query select false, null::bigint, 'sky budget disabled'::text, 0::bigint, 0; return;
  end if;

  v_want := least(greatest(coalesce(p_max_tokens, b.per_call_max_tokens), 1),
                  b.per_call_max_tokens);

  select coalesce(sum(greatest(reserved_tokens, input_tokens + output_tokens)), 0),
         count(*)
    into v_tokens, v_calls
    from public.sky_spend where day = v_today;

  if v_calls >= b.daily_call_cap then
    return query select false, null::bigint, 'daily call cap reached'::text,
                        greatest(b.daily_token_cap - v_tokens, 0), 0;
    return;
  end if;
  if v_tokens + v_want > b.daily_token_cap then
    return query select false, null::bigint, 'daily token cap reached'::text,
                        greatest(b.daily_token_cap - v_tokens, 0),
                        greatest(b.daily_call_cap - v_calls, 0);
    return;
  end if;

  insert into public.sky_spend (day, reserved_tokens) values (v_today, v_want)
  returning id into v_id;

  return query select true, v_id, null::text,
                      greatest(b.daily_token_cap - v_tokens - v_want, 0),
                      greatest(b.daily_call_cap - v_calls - 1, 0);
end $$;

/** Correct a reservation to what the call actually used.
 *
 *  Reservations are the worst case, so without this the cap would be reached
 *  far earlier than real usage warrants. A call that never completed settles
 *  at zero tokens with ok = false, which keeps the failure visible in the
 *  record rather than silently freeing the budget.
 */
create or replace function public.sky_settle(
  p_reservation bigint, p_input int, p_output int,
  p_provider text, p_model text, p_ok boolean)
returns void language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
begin
  update public.sky_spend
     set settled_at = now(),
         input_tokens = greatest(coalesce(p_input, 0), 0),
         output_tokens = greatest(coalesce(p_output, 0), 0),
         reserved_tokens = case when p_ok
              then least(reserved_tokens,
                         greatest(coalesce(p_input,0) + coalesce(p_output,0), 0))
              else 0 end,
         provider = p_provider, model = p_model, ok = p_ok
   where id = p_reservation;
end $$;

/** What Sky has cost today and over the last week, for /admin/sky. */
create or replace function public.sky_spend_summary()
returns table (day date, calls int, input_tokens bigint, output_tokens bigint, failures int)
language sql stable security definer
set search_path = pg_catalog, public as $$
  select s.day, count(*)::int,
         sum(s.input_tokens)::bigint, sum(s.output_tokens)::bigint,
         count(*) filter (where s.ok is false)::int
    from public.sky_spend s
   where (public.is_owner() or public.has_role('admin'))
     and s.day > ((now() at time zone 'utc')::date - 7)
   group by s.day order by s.day desc;
$$;

-- ---------------------------------------------------------------- RLS

alter table public.sky_budget enable row level security;
alter table public.sky_spend  enable row level security;

create policy "sky budget: administrators read" on public.sky_budget
  for select using (public.is_owner() or public.has_role('admin'));
create policy "sky spend: administrators read" on public.sky_spend
  for select using (public.is_owner() or public.has_role('admin'));

revoke insert, update, delete on public.sky_budget, public.sky_spend
  from anon, authenticated;

-- ---------------------------------------------------------------- privileges
--
-- The reserve and settle functions are callable ONLY by service_role — that is
-- the Worker, holding the service key that never reaches a browser. Exposing
-- them to `authenticated` would hand every signed-in learner a way to burn the
-- day's budget with a loop, which is the thing this file exists to prevent.

revoke execute on function public.sky_reserve(int) from public, anon, authenticated;
grant  execute on function public.sky_reserve(int) to service_role;

revoke execute on function public.sky_settle(bigint,int,int,text,text,boolean)
  from public, anon, authenticated;
grant  execute on function public.sky_settle(bigint,int,int,text,text,boolean) to service_role;

revoke execute on function public.sky_spend_summary() from public, anon;
grant  execute on function public.sky_spend_summary() to authenticated, service_role;
