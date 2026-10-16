-- 0017 · Section switches, the sign-in record, anonymous page counts, the admin's
-- view of all three, and a board that shows streaks.
--
-- Five pieces, one migration, because each exists for the same screen: /admin.
--
--   1. site_sections    one switch per community section, open or closed in one
--                       click by an admin or an owner — without ever being able
--                       to open a room that the safeguarding conditions forbid.
--   2. login_events     when somebody signed in, from what kind of device, by
--                       which provider. No IP address, no browser string.
--   3. site_hits        anonymous page counts: a day, a path, a device class, a
--                       country, a share channel, and a number. No identifier of
--                       any kind, so there is nothing to join to a person.
--   4. admin_*          the reads that turn 2 and 3, and the tables that already
--                       exist, into the user-management and analytics screens.
--   5. sky_board        daily_board plus a learning streak, for Sky's panel.
--
-- What none of it does: store an IP address, set a cookie, or reach a third
-- party. Every figure is computed here, from rows that are ours.

-- ============================================================================
-- 1 · Section switches
-- ============================================================================
-- The Community page marks every section "Planned", and its comment says why:
-- nobody should ever click into an empty room. So a section has THREE states
-- rather than two:
--
--   planned   nothing is built. Only an owner can say otherwise.
--   closed    built, switched off.
--   open      built, switched on.
--
-- An admin or an owner flips closed <-> open in one click. Marking a section
-- built is a statement about what exists, so it stays with an owner.
--
-- Sections that carry learner-written text (Ask Doubts, rooms, members) are
-- flagged needs_safeguarding. Opening one is refused unless rooms_open() is true,
-- which is the conjunctive gate from 0007: a named safeguarding owner AND deputy
-- AND the switch. The one-click button therefore cannot do what the design
-- forbids; it can only close, which is always safe, and open what is already
-- permitted.
create table if not exists public.site_sections (
  key                text primary key,
  label              text not null,
  group_name         text not null,
  needs_safeguarding boolean not null default false,
  state              text not null default 'planned' check (state in ('planned', 'closed', 'open')),
  updated_by         uuid references public.profiles(id) on delete set null,
  updated_at         timestamptz not null default now()
);
comment on table public.site_sections is
  'One row per community section. The state is public (the pages show it); changes go through set_section_state only.';

alter table public.site_sections enable row level security;
drop policy if exists "site_sections: public read" on public.site_sections;
create policy "site_sections: public read" on public.site_sections for select using (true);
-- No insert, update or delete policy: the function below is the only way in.

insert into public.site_sections (key, label, group_name, needs_safeguarding) values
  ('doubts',         'Ask Doubts',        'Learners',  true),
  ('rooms',          'Topic rooms',       'Learners',  true),
  ('members',        'Members',           'Learners',  true),
  ('partners',       'Partners',          'Community', false),
  ('beta',           'Beta testers',      'Community', false),
  ('blog',           'Blog',              'Community', false),
  ('podcast',        'The Lrnon Podcast', 'Community', false),
  ('techblog',       'Tech blog',         'Community', false),
  ('articles',       'Articles',          'More',      false),
  ('directory',      'Directory',         'More',      false),
  ('become-partner', 'Become a partner',  'More',      false)
on conflict (key) do nothing;

create or replace function public.set_section_state(p_key text, p_state text, p_reason text default null)
returns public.site_sections
language plpgsql security definer set search_path = public as $$
declare
  v_row   public.site_sections;
  v_old   text;
  v_owner boolean := public.is_owner();
  v_admin boolean := public.has_role('admin');
begin
  if auth.uid() is null or not (v_owner or v_admin) then
    raise exception 'set_section_state: an admin or an owner only';
  end if;
  if p_state not in ('planned', 'closed', 'open') then
    raise exception 'set_section_state: state must be planned, closed or open';
  end if;

  select * into v_row from public.site_sections where key = p_key for update;
  if not found then raise exception 'set_section_state: no such section'; end if;
  v_old := v_row.state;
  if v_old = p_state then return v_row; end if;

  if (v_old = 'planned' or p_state = 'planned') and not v_owner then
    raise exception 'set_section_state: only an owner can mark a section built or unbuilt';
  end if;

  if p_state = 'open' then
    if v_old = 'planned' then
      raise exception 'set_section_state: nothing is built under "%" yet', v_row.label;
    end if;
    if v_row.needs_safeguarding and not public.rooms_open() then
      raise exception 'set_section_state: blocked. Opening "%" needs the child-safety conditions to hold first: a named safeguarding owner and deputy, with rooms switched on. See /safeguarding.', v_row.label;
    end if;
  end if;

  update public.site_sections
     set state = p_state, updated_by = auth.uid(), updated_at = now()
   where key = p_key returning * into v_row;

  insert into public.admin_audit (actor, action, detail, reason)
  values (auth.uid(), 'set_section_state',
          jsonb_build_object('key', p_key, 'from', v_old, 'to', p_state), p_reason);
  return v_row;
end $$;

/* The red button. Closes every section that carries learner-written text, in one
   statement, for anyone with the authority to open them. It cannot open
   anything. */
create or replace function public.close_all_forums(p_reason text default null)
returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if auth.uid() is null or not (public.is_owner() or public.has_role('admin')) then
    raise exception 'close_all_forums: an admin or an owner only';
  end if;
  update public.site_sections
     set state = 'closed', updated_by = auth.uid(), updated_at = now()
   where needs_safeguarding and state = 'open';
  get diagnostics v_n = row_count;
  insert into public.admin_audit (actor, action, detail, reason)
  values (auth.uid(), 'close_all_forums', jsonb_build_object('closed', v_n), p_reason);
  return v_n;
end $$;

/* What the PAGES should believe. A section can be marked open while rooms_open()
   is false, for instance after an owner turns rooms off in an incident; the
   effective state then reads closed, so a public page can never show "open" over
   a room the database will refuse. */
create or replace function public.section_states()
returns table (key text, label text, group_name text, state text)
language sql stable security definer set search_path = public as $$
  select s.key, s.label, s.group_name,
         case when s.needs_safeguarding and s.state = 'open' and not public.rooms_open()
              then 'closed' else s.state end
    from public.site_sections s order by s.group_name, s.label;
$$;

revoke execute on function public.set_section_state(text, text, text) from public, anon;
revoke execute on function public.close_all_forums(text)              from public, anon;
grant  execute on function public.set_section_state(text, text, text) to authenticated;
grant  execute on function public.close_all_forums(text)              to authenticated;
revoke execute on function public.section_states() from public;
grant  execute on function public.section_states() to anon, authenticated;

-- ============================================================================
-- 2 · The sign-in record
-- ============================================================================
-- "Build user login detailed for any action later." The record of ACTIONS by
-- admins already exists (admin_audit, 0004, append-only). What did not exist is
-- the record of SIGN-INS, which is what makes "who was in, when" answerable.
--
-- Deliberately thin: a time, a provider and a device class. No IP address and no
-- user-agent string, because a sign-in log that stores them is a location history
-- and a fingerprint, and the privacy page promises neither. A learner can read
-- their own rows.
create table if not exists public.login_events (
  id       bigserial primary key,
  user_id  uuid not null references public.profiles(id) on delete cascade,
  at       timestamptz not null default now(),
  provider text,
  device   text not null default 'unknown' check (device in ('mobile', 'tablet', 'desktop', 'unknown'))
);
create index if not exists login_events_user_at on public.login_events (user_id, at desc);
alter table public.login_events enable row level security;

drop policy if exists "login_events: read own or staff" on public.login_events;
create policy "login_events: read own or staff" on public.login_events
  for select using (user_id = auth.uid() or public.has_role('admin') or public.is_owner());

comment on table public.login_events is
  'Sign-ins: when, provider, device class. No IP and no browser string, by design. Kept 24 months (purge_old_logins).';

/* At most one row per quarter hour per person: a reload or a token refresh is
   not a sign-in, and a log that records every page load is surveillance with
   extra steps. */
create or replace function public.record_login(p_device text default 'unknown')
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if p_device is null or p_device not in ('mobile', 'tablet', 'desktop', 'unknown') then p_device := 'unknown'; end if;
  if exists (select 1 from public.login_events
              where user_id = auth.uid() and at > now() - interval '15 minutes') then
    return;
  end if;
  insert into public.login_events (user_id, provider, device)
  values (auth.uid(), (select u.raw_app_meta_data ->> 'provider' from auth.users u where u.id = auth.uid()), p_device);
end $$;

create or replace function public.purge_old_logins()
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not public.is_owner() then raise exception 'purge_old_logins: an owner only'; end if;
  delete from public.login_events where at < now() - interval '24 months';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke execute on function public.record_login(text) from public, anon;
grant  execute on function public.record_login(text) to authenticated;
revoke execute on function public.purge_old_logins() from public, anon;
grant  execute on function public.purge_old_logins() to authenticated;

-- ============================================================================
-- 3 · Anonymous page counts
-- ============================================================================
-- The site has no analytics today, and the privacy page says so. This adds the
-- smallest thing that answers "is anyone reading this": a counter, keyed by day,
-- path, device class, country and share channel. There is no visitor id, no
-- session id, no cookie and no IP address in the table or anywhere the request
-- passes through on its way to it, so two rows can never be joined into a
-- person.
--
-- Written only by the Worker route /api/hit, through the service role. A browser
-- cannot call record_hit; that would let anyone inflate or flood it.
create table if not exists public.site_hits (
  day     date not null,
  path    text not null,
  device  text not null,
  country text not null,
  via     text not null default '',
  hits    int  not null default 0,
  primary key (day, path, device, country, via)
);
alter table public.site_hits enable row level security;
drop policy if exists "site_hits: staff read" on public.site_hits;
create policy "site_hits: staff read" on public.site_hits
  for select using (public.has_role('admin') or public.is_owner());

create or replace function public.record_hit(p_path text, p_device text, p_country text, p_via text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_path text := left(regexp_replace(coalesce(p_path, ''), '[?#].*$', ''), 120);
  v_dev  text := case when p_device in ('mobile', 'tablet', 'desktop') then p_device else 'unknown' end;
  v_cc   text := case when p_country ~ '^[A-Z]{2}$' then p_country else 'ZZ' end;
  v_via  text := case when coalesce(p_via, '') ~ '^[a-z0-9-]{1,24}$' then p_via else '' end;
begin
  if v_path !~ '^/' then return; end if;
  insert into public.site_hits as h (day, path, device, country, via, hits)
  values ((now() at time zone 'UTC')::date, v_path, v_dev, v_cc, v_via, 1)
  on conflict (day, path, device, country, via) do update set hits = h.hits + 1;
end $$;

revoke execute on function public.record_hit(text, text, text, text) from public, anon, authenticated;
grant  execute on function public.record_hit(text, text, text, text) to service_role;

-- ============================================================================
-- 4 · The admin's reads
-- ============================================================================
create or replace function public.admin_analytics(p_days int default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_from date;
  v_from_ts timestamptz;
begin
  if auth.uid() is null or not (public.is_owner() or public.has_role('admin')) then
    raise exception 'admin_analytics: an admin or an owner only';
  end if;
  p_days    := least(greatest(coalesce(p_days, 30), 1), 365);
  v_from    := (now() at time zone 'UTC')::date - (p_days - 1);
  v_from_ts := v_from::timestamptz;

  return jsonb_build_object(
    'days', p_days,
    'from', v_from,

    -- Readers (counts only; see site_hits)
    'views_total', coalesce((select sum(hits) from public.site_hits where day >= v_from), 0),
    'views_by_day', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'n', n) order by day)
      from (select day, sum(hits)::int n from public.site_hits where day >= v_from group by day) x), '[]'::jsonb),
    'top_pages', coalesce((select jsonb_agg(jsonb_build_object('path', path, 'n', n) order by n desc)
      from (select path, sum(hits)::int n from public.site_hits where day >= v_from group by path order by 2 desc limit 15) x), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('device', device, 'n', n) order by n desc)
      from (select device, sum(hits)::int n from public.site_hits where day >= v_from group by device) x), '[]'::jsonb),
    'countries', coalesce((select jsonb_agg(jsonb_build_object('country', country, 'n', n) order by n desc)
      from (select country, sum(hits)::int n from public.site_hits where day >= v_from group by country order by 2 desc limit 12) x), '[]'::jsonb),
    'arrivals_by_share_channel', coalesce((select jsonb_agg(jsonb_build_object('via', via, 'n', n) order by n desc)
      from (select via, sum(hits)::int n from public.site_hits where day >= v_from and via <> '' and path = '/' group by via) x), '[]'::jsonb),

    -- Accounts
    'accounts_total', (select count(*) from public.profiles),
    'signups_by_day', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'n', n) order by day)
      from (select created_at::date as day, count(*)::int n from public.profiles where created_at >= v_from_ts group by 1) x), '[]'::jsonb),
    'signins_by_day', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'n', n) order by day)
      from (select at::date as day, count(*)::int n from public.login_events where at >= v_from_ts group by 1) x), '[]'::jsonb),
    'active_7d', (select count(distinct user_id) from public.reward_events where created_at >= now() - interval '7 days'),
    'active_30d', (select count(distinct user_id) from public.reward_events where created_at >= now() - interval '30 days'),
    'active_by_day', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'n', n) order by day)
      from (select created_at::date as day, count(distinct user_id)::int n from public.reward_events where created_at >= v_from_ts group by 1) x), '[]'::jsonb),
    'returning_7d', (select count(distinct e.user_id) from public.reward_events e join public.profiles p on p.id = e.user_id
                      where e.created_at >= now() - interval '7 days' and p.created_at < now() - interval '7 days'),

    -- Learning
    'lessons_completed', (select count(*) from public.lesson_progress where status = 'completed' and completed_at >= v_from_ts),
    'lessons_by_day', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'n', n) order by day)
      from (select completed_at::date as day, count(*)::int n from public.lesson_progress where status = 'completed' and completed_at >= v_from_ts group by 1) x), '[]'::jsonb),
    'lessons_top', coalesce((select jsonb_agg(jsonb_build_object('lesson', lesson_slug, 'n', n) order by n desc)
      from (select lesson_slug, count(*)::int n from public.lesson_progress where status = 'completed' and completed_at >= v_from_ts group by 1 order by 2 desc limit 10) x), '[]'::jsonb),
    'quiz_passes', (select count(*) from public.reward_events where reason = 'module_quiz_pass' and created_at >= v_from_ts),
    'review_sessions', (select count(*) from public.reward_events where reason = 'review_session' and created_at >= v_from_ts),
    'quick_quizzes', (select count(*) from public.reward_events where reason = 'quick_quiz' and created_at >= v_from_ts),
    'board_opt_ins', (select count(*) from public.profiles where leaderboard_opt_in)
  );
end $$;

revoke execute on function public.admin_analytics(int) from public, anon;
grant  execute on function public.admin_analytics(int) to authenticated;

/* The user list. Email is an owner's to see: an admin who runs a surface has a
   reason to know who a learner is by handle and how they are doing, and none to
   read their address. */
create or replace function public.admin_users(p_search text default null, p_limit int default 50, p_offset int default 0)
returns table (
  user_id uuid, handle citext, email text, created_at timestamptz, last_sign_in_at timestamptz,
  provider text, roles text[], xp bigint, level int, lessons int,
  last_active timestamptz, logins_30d int, board_opt_in boolean, suspended boolean
)
language plpgsql stable security definer set search_path = public as $$
declare v_owner boolean := public.is_owner();
begin
  if auth.uid() is null or not (v_owner or public.has_role('admin')) then
    raise exception 'admin_users: an admin or an owner only';
  end if;
  p_limit  := least(greatest(coalesce(p_limit, 50), 1), 200);
  p_offset := greatest(coalesce(p_offset, 0), 0);

  return query
  select p.id, p.handle,
         case when v_owner then u.email::text else null end,
         p.created_at, u.last_sign_in_at, (u.raw_app_meta_data ->> 'provider'),
         coalesce((select array_agg(r.role order by r.role) from public.user_roles r
                    where r.user_id = p.id and (r.expires_at is null or r.expires_at > now())), '{}'::text[]),
         coalesce(b.xp, 0), coalesce(b.level, 1),
         (select count(*)::int from public.lesson_progress lp where lp.user_id = p.id and lp.status = 'completed'),
         (select max(e.created_at) from public.reward_events e where e.user_id = p.id),
         (select count(*)::int from public.login_events l where l.user_id = p.id and l.at > now() - interval '30 days'),
         p.leaderboard_opt_in,
         (u.banned_until is not null and u.banned_until > now())
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.reward_balances b on b.user_id = p.id
   where coalesce(p_search, '') = ''
      or p.handle::text ilike '%' || p_search || '%'
      or (v_owner and u.email ilike '%' || p_search || '%')
   order by p.created_at desc
   limit p_limit offset p_offset;
end $$;

create or replace function public.admin_user_detail(p_user uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_owner boolean := public.is_owner();
begin
  if auth.uid() is null or not (v_owner or public.has_role('admin')) then
    raise exception 'admin_user_detail: an admin or an owner only';
  end if;
  return jsonb_build_object(
    'profile', (select jsonb_build_object(
        'user_id', p.id, 'handle', p.handle, 'created_at', p.created_at, 'timezone', p.timezone,
        'locale', p.locale, 'goal_mode', p.goal_mode, 'board_opt_in', p.leaderboard_opt_in,
        'email', case when v_owner then u.email else null end,
        'last_sign_in_at', u.last_sign_in_at, 'provider', u.raw_app_meta_data ->> 'provider',
        'suspended', (u.banned_until is not null and u.banned_until > now()))
       from public.profiles p join auth.users u on u.id = p.id where p.id = p_user),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('role', role, 'function', function, 'expires_at', expires_at))
                         from public.user_roles where user_id = p_user), '[]'::jsonb),
    'signins', coalesce((select jsonb_agg(jsonb_build_object('at', at, 'provider', provider, 'device', device) order by at desc)
                           from (select * from public.login_events where user_id = p_user order by at desc limit 50) l), '[]'::jsonb),
    'actions_about', coalesce((select jsonb_agg(jsonb_build_object('at', at, 'action', action, 'actor', actor, 'detail', detail, 'reason', reason) order by at desc)
                                 from (select * from public.admin_audit where target = p_user order by at desc limit 50) a), '[]'::jsonb),
    'actions_by', coalesce((select jsonb_agg(jsonb_build_object('at', at, 'action', action, 'target', target, 'detail', detail, 'reason', reason) order by at desc)
                              from (select * from public.admin_audit where actor = p_user order by at desc limit 50) a), '[]'::jsonb),
    'progress', jsonb_build_object(
        'xp', coalesce((select xp from public.reward_balances where user_id = p_user), 0),
        'level', coalesce((select level from public.reward_balances where user_id = p_user), 1),
        'lessons', (select count(*) from public.lesson_progress where user_id = p_user and status = 'completed'),
        'quiz_passes', (select count(*) from public.reward_events where user_id = p_user and reason = 'module_quiz_pass'),
        'review_sessions', (select count(*) from public.reward_events where user_id = p_user and reason = 'review_session'),
        'streak', public.learning_streak(p_user, coalesce((select timezone from public.profiles where id = p_user), 'UTC')),
        'recent', coalesce((select jsonb_agg(jsonb_build_object('at', created_at, 'reason', reason, 'ref', ref_slug, 'amount', amount) order by created_at desc)
                              from (select * from public.reward_events where user_id = p_user order by created_at desc limit 20) e), '[]'::jsonb))
  );
end $$;

/* The audit log, newest first, with who and about whom. Staff only. */
create or replace function public.admin_activity(p_limit int default 100)
returns table (at timestamptz, actor uuid, actor_handle citext, action text, target uuid, target_handle citext, detail jsonb, reason text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not (public.is_owner() or public.has_role('admin')) then
    raise exception 'admin_activity: an admin or an owner only';
  end if;
  return query
  select a.at, a.actor, pa.handle, a.action, a.target, pt.handle, a.detail, a.reason
    from public.admin_audit a
    left join public.profiles pa on pa.id = a.actor
    left join public.profiles pt on pt.id = a.target
   order by a.at desc limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;

/* Written by the Worker when it suspends someone (the one thing that needs the
   auth admin API). The actor is passed in because the service role has no
   auth.uid(); only the service role can call this, and the Worker has already
   verified the actor's token and role before it gets here. */
create or replace function public.log_admin_action(p_actor uuid, p_action text, p_target uuid, p_detail jsonb, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.admin_audit (actor, action, target, detail, reason)
  values (p_actor, p_action, p_target, coalesce(p_detail, '{}'::jsonb), p_reason);
end $$;

revoke execute on function public.admin_users(text, int, int)   from public, anon;
revoke execute on function public.admin_user_detail(uuid)       from public, anon;
revoke execute on function public.admin_activity(int)           from public, anon;
grant  execute on function public.admin_users(text, int, int)   to authenticated;
grant  execute on function public.admin_user_detail(uuid)       to authenticated;
grant  execute on function public.admin_activity(int)           to authenticated;
revoke execute on function public.log_admin_action(uuid, text, uuid, jsonb, text) from public, anon, authenticated;
grant  execute on function public.log_admin_action(uuid, text, uuid, jsonb, text) to service_role;

-- ============================================================================
-- 5 · The board with streaks
-- ============================================================================
-- A learning streak counts only the reasons that are learning: a lesson, a module
-- quiz, a review, a quick quiz. A bonus star is not one (see progress-core's
-- LEARNING_REASONS, which this mirrors), so a star cannot keep a streak alive.
-- Consecutive local days ending today or yesterday in the given zone.
create or replace function public.learning_streak(p_user uuid, p_tz text)
returns int language sql stable security definer set search_path = public as $$
  with d as (
    select distinct (timezone(p_tz, created_at))::date as day
      from public.reward_events
     where user_id = p_user and kind = 'xp'
       and reason in ('lesson_complete', 'module_quiz_pass', 'review_session', 'quick_quiz')
  ),
  g as (select day, day - (row_number() over (order by day))::int as grp from d),
  last_run as (select grp, max(day) as last_day from g group by grp order by max(day) desc limit 1)
  select coalesce((select count(*)::int from g join last_run l on l.grp = g.grp
                    where l.last_day >= (timezone(p_tz, now()))::date - 1), 0);
$$;
revoke execute on function public.learning_streak(uuid, text) from public, anon, authenticated;

create or replace function public.sky_board(p_scope text default 'today', p_limit int default 10)
returns table (
  rank int, handle citext, level int, lessons int, reviews int,
  points bigint, streak int, is_me boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz    text := 'UTC';
  v_start timestamptz;
begin
  if p_scope not in ('today', 'week') then
    raise exception 'sky_board: scope must be today or week';
  end if;
  p_limit := least(greatest(coalesce(p_limit, 10), 1), 50);

  if auth.uid() is not null then
    select coalesce(timezone, 'UTC') into v_tz from public.profiles where id = auth.uid();
  end if;
  if not exists (select 1 from pg_timezone_names where name = v_tz) then v_tz := 'UTC'; end if;

  v_start := case when p_scope = 'today'
    then date_trunc('day',  timezone(v_tz, now())) at time zone v_tz
    else date_trunc('week', timezone(v_tz, now())) at time zone v_tz end;

  return query
  with window_events as (
    select e.user_id,
           sum(e.amount)::bigint                                     as points,
           count(*) filter (where e.reason = 'lesson_complete')::int as lessons,
           count(*) filter (where e.reason = 'review_session')::int  as reviews
      from public.reward_events e
      join public.profiles p on p.id = e.user_id
     where p.leaderboard_opt_in and e.created_at >= v_start and e.kind = 'xp'
     group by e.user_id
    having sum(e.amount) > 0
  ),
  lifetime as (
    select e.user_id, public.level_for_xp(sum(e.amount)::bigint) as level
      from public.reward_events e where e.kind = 'xp' group by e.user_id
  ),
  ranked as (
    select w.*, p.handle as h, coalesce(l.level, 1) as lv, p.id = auth.uid() as me
      from window_events w
      join public.profiles p on p.id = w.user_id
      left join lifetime l on l.user_id = w.user_id
     order by w.points desc, p.handle
     limit p_limit
  )
  select (row_number() over (order by r.points desc, r.h))::int,
         r.h, r.lv, r.lessons, r.reviews, r.points,
         public.learning_streak(r.user_id, v_tz),
         r.me
    from ranked r
   order by r.points desc, r.h;
end $$;

revoke execute on function public.sky_board(text, int) from public, anon;
grant  execute on function public.sky_board(text, int) to authenticated;

comment on function public.sky_board(text, int) is
  'The opt-in board with learning streaks, for Sky. Same safety properties as '
  'daily_board: generated handles, levels and counts only, nothing a learner typed.';
