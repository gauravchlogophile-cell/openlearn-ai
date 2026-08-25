-- 0008 · Generated handles, and the opt-in daily board from design turn 7.
--
-- ============================================================================
-- PART 1 — the handle. This is a safeguarding fix, not a feature.
-- ============================================================================
-- 0007's comment on posts.author_handle says handles are "Generated, never
-- chosen, so a child cannot publish their own name by putting it in a handle."
-- That was ASPIRATIONAL. In 0001, handle_new_user() inserts a profile with a
-- NULL handle, and the "profiles: update own" policy lets a learner set it to
-- anything matching ^[a-z0-9_]{3,24}$ — which cheerfully accepts
-- 'sarah_smith_11'.
--
-- Nothing exposed that yet because no surface displayed a handle. The board
-- below is the first one, so the guarantee has to become real first: generate
-- the handle at signup, and refuse to let it be edited afterwards.

-- Hyphens, because the design's handles are two words joined by one
-- ("quiet-fern", "still-harbour"). Existing underscore handles stay legal so
-- the constraint change cannot reject a row that is already stored. Leading
-- and trailing separators are excluded — '-a-' is a handle nobody typed on
-- purpose.
alter table public.profiles drop constraint if exists profiles_handle_check;
alter table public.profiles add constraint profiles_handle_check
  check (handle ~ '^[a-z0-9][a-z0-9_-]{1,22}[a-z0-9]$');

/* Two gentle wordlists. Every combination has to be safe to show to and about
   a child, so these are deliberately dull: weather, landscape and materials,
   nothing bodily, nothing evaluative ("clever-fox" invites comparison), and
   no proper nouns. 40 x 40 = 1600 pairs before the numeric suffix. */
create or replace function public.generate_handle()
returns text language plpgsql volatile set search_path = public as $$
declare
  adjectives text[] := array[
    'quiet','still','slow','wide','soft','calm','pale','deep','warm','cool',
    'north','south','east','west','high','low','far','near','open','bright',
    'copper','amber','silver','olive','indigo','umber','ivory','ochre','ashen','russet',
    'early','late','first','last','long','short','plain','clear','fresh','even'];
  nouns text[] := array[
    'fern','harbour','lane','meadow','river','ember','cedar','heather','willow','birch',
    'moor','fen','brook','ridge','hollow','thicket','orchard','pasture','estuary','delta',
    'lantern','anchor','compass','beacon','kettle','ladder','satchel','quilt','lattice','trellis',
    'drizzle','frost','thaw','dusk','dawn','tide','current','breeze','shale','sandstone'];
  candidate text;
  i int;
begin
  -- Try unsuffixed pairs first so the common case reads like the design.
  for i in 1..12 loop
    candidate := adjectives[1 + floor(random() * array_length(adjectives, 1))::int]
              || '-' ||
                 nouns[1 + floor(random() * array_length(nouns, 1))::int];
    if not exists (select 1 from profiles where handle = candidate) then
      return candidate;
    end if;
  end loop;

  -- Then with a suffix. The loop is bounded: a function that can spin forever
  -- inside a signup trigger would turn handle exhaustion into a signup outage.
  for i in 1..40 loop
    candidate := adjectives[1 + floor(random() * array_length(adjectives, 1))::int]
              || '-' ||
                 nouns[1 + floor(random() * array_length(nouns, 1))::int]
              || '-' || lpad(floor(random() * 1000)::text, 3, '0');
    if not exists (select 1 from profiles where handle = candidate) then
      return candidate;
    end if;
  end loop;

  raise exception 'generate_handle: exhausted';
end $$;
revoke execute on function public.generate_handle() from public, anon, authenticated;

-- Backfill. Every existing profile gets one, so no surface has to cope with a
-- NULL handle and no learner is silently left off a board they opted into.
do $$
declare r record;
begin
  for r in select id from public.profiles where handle is null loop
    update public.profiles set handle = public.generate_handle() where id = r.id;
  end loop;
end $$;

-- Assign at signup. handle_new_user is replaced rather than extended so the
-- whole of it stays readable in one place.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, handle) values (new.id, public.generate_handle());
  return new;
end $$;

/* Make "never chosen" true. RLS WITH CHECK cannot express this: it sees only
   the proposed row, not the one being replaced, so it cannot tell a handle
   change from a timezone change. A BEFORE UPDATE trigger can.

   An owner can still correct one — if a generated pair turns out to be
   unfortunate in some language, somebody has to be able to fix it — and every
   such change is audited. */
create or replace function public.profiles_lock_handle()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.handle is distinct from old.handle then
    if not public.is_owner() then
      raise exception 'handle is generated and cannot be changed';
    end if;
    insert into admin_audit (actor, action, detail)
    values (auth.uid(), 'change_handle',
            jsonb_build_object('profile', old.id, 'from', old.handle, 'to', new.handle));
  end if;
  return new;
end $$;

drop trigger if exists profiles_lock_handle on public.profiles;
create trigger profiles_lock_handle
  before update on public.profiles
  for each row execute function public.profiles_lock_handle();

-- ============================================================================
-- PART 2 — the daily board.
-- ============================================================================
-- Design turn 7: "Opt in and out whenever you like. Leaving removes your past
-- entries too. Only a display name, an avatar and a level show. Never your
-- real name, email or location. Points come from lessons, quizzes and review
-- cards — not from time spent on the site. There is no prize."
--
-- Safety properties, by construction rather than by policy:
--
--   * The board carries NO learner-authored text. A handle is generated, a
--     level is arithmetic, the counts are counts. There is no field anybody
--     could type a phone number into. This is why a board is safe to open
--     while rooms (which carry writing) stay shut.
--   * "Leaving removes your past entries too" needs no delete: the board is
--     computed live from profiles where leaderboard_opt_in is true, so
--     clearing the flag removes the learner from every board, including ones
--     drawn for past days. Deleting reward_events to achieve this would
--     destroy the learner's own XP, which is the opposite of what they asked.
--   * Default is false, from 0001. Nobody appears without acting.

create or replace function public.set_leaderboard_opt_in(p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'set_leaderboard_opt_in: sign in first'; end if;
  update profiles set leaderboard_opt_in = p_on, updated_at = now() where id = auth.uid();
end $$;

/* The board itself.
   Scope 'today'  -> since midnight in the VIEWER's timezone, per the design's
                     "Resets at midnight, your time zone".
   Scope 'week'   -> since Monday in the same zone.
   Ranked by points in the window; ties broken by handle so the order is
   stable between two calls a second apart. */
create or replace function public.daily_board(p_scope text default 'today', p_limit int default 10)
returns table (
  rank int, handle citext, level int,
  lessons int, reviews int, points bigint, is_me boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_tz    text := 'UTC';
  v_start timestamptz;
begin
  if p_scope not in ('today', 'week') then
    raise exception 'daily_board: scope must be today or week';
  end if;
  p_limit := least(greatest(coalesce(p_limit, 10), 1), 50);

  if auth.uid() is not null then
    select coalesce(timezone, 'UTC') into v_tz from profiles where id = auth.uid();
  end if;
  -- An unknown zone must not take the board down with it.
  begin
    v_start := case when p_scope = 'today'
      then date_trunc('day',  timezone(v_tz, now())) at time zone v_tz
      else date_trunc('week', timezone(v_tz, now())) at time zone v_tz
    end;
  exception when others then
    v_start := case when p_scope = 'today'
      then date_trunc('day', now()) else date_trunc('week', now()) end;
  end;

  return query
  with window_events as (
    select e.user_id,
           sum(e.amount)::bigint                                        as points,
           count(*) filter (where e.reason = 'lesson_complete')::int    as lessons,
           count(*) filter (where e.reason = 'review_session')::int     as reviews
      from reward_events e
      join profiles p on p.id = e.user_id
     where p.leaderboard_opt_in
       and e.created_at >= v_start
       and e.kind = 'xp'
     group by e.user_id
    having sum(e.amount) > 0
  ),
  lifetime as (
    select e.user_id, public.level_for_xp(sum(e.amount)::bigint) as level
      from reward_events e
     where e.kind = 'xp' group by e.user_id
  )
  select (row_number() over (order by w.points desc, p.handle))::int,
         p.handle,
         coalesce(l.level, 1),
         w.lessons, w.reviews, w.points,
         p.id = auth.uid()
    from window_events w
    join profiles p on p.id = w.user_id
    left join lifetime l on l.user_id = w.user_id
   order by w.points desc, p.handle
   limit p_limit;
end $$;

-- Signed in only. An open board is an enumerable list of learners, and there
-- is no reason a logged-out visitor needs one.
revoke execute on function public.set_leaderboard_opt_in(boolean) from public, anon;
revoke execute on function public.daily_board(text, int)           from public, anon;
grant  execute on function public.set_leaderboard_opt_in(boolean)  to authenticated;
grant  execute on function public.daily_board(text, int)           to authenticated;

comment on function public.daily_board(text, int) is
  'Opt-in board for /home. Returns generated handles, levels and counts only — '
  'no learner-authored text exists in the result, which is why this can be '
  'open while rooms stay closed. Opting out removes past entries by '
  'construction: the board is computed live from the opt-in flag.';
