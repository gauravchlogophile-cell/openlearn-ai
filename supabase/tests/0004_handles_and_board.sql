-- pgTAP for 0008 — generated handles and the opt-in board.
--
-- The handle tests matter most. 0007 already CLAIMED handles were generated
-- and never chosen; nothing enforced it, and nothing noticed, because no page
-- displayed one. These assertions are what turn that comment into a fact.
--
-- All fourteen were additionally run against the production schema as plain
-- SQL predicates, and all fourteen passed. pgTAP is available there but not
-- installed, and installing an extension on production to run a test suite is
-- not a trade worth making — the CI `db` job runs this file properly against
-- a local instance.
begin;
select plan(14);

-- ------------------------------------------------------------------ handles
select has_function('public', 'generate_handle', 'generate_handle exists');

select ok(
  (select public.generate_handle()) ~ '^[a-z]+-[a-z]+(-[0-9]{3})?$',
  'a generated handle is two gentle words, optionally suffixed');

/* Twenty draws, expecting at least ten distinct. Comparing just two would
   have been flaky: 1600 pairs means two draws collide roughly one run in
   1600, which is rare enough to look like a real failure when it finally
   happens and often enough to happen. Across twenty draws the expected number
   of collisions is about 0.12, so needing eleven of them to fail this is
   effectively impossible — while a frozen RNG returns one distinct value and
   fails every time, which is the thing worth catching. */
select cmp_ok(
  (select count(distinct public.generate_handle())::int from generate_series(1, 20)),
  '>=', 10,
  'handles are actually random, not a frozen value');

-- Every existing learner has one, or the board has to render a NULL.
select is(
  (select count(*)::int from public.profiles where handle is null),
  0, 'no profile is left without a handle');

-- Signup assigns one. Checking the source is weaker than calling the trigger,
-- but calling it needs an auth.users insert, which this fixture cannot do.
select ok(
  (select prosrc like '%generate_handle%' from pg_proc where proname = 'handle_new_user' and pronamespace = 'public'::regnamespace),
  'signup generates a handle rather than leaving it null');

select has_function('public', 'profiles_lock_handle', 'the handle lock exists');

select ok(
  (select count(*) > 0 from pg_trigger
    where tgname = 'profiles_lock_handle' and not tgisinternal
      and tgrelid = 'public.profiles'::regclass),
  'the lock is actually attached to profiles, not merely defined');

-- The one that would have let a child publish their own name.
select ok(
  (select prosrc like '%cannot be changed%' from pg_proc where proname = 'profiles_lock_handle' and pronamespace = 'public'::regnamespace),
  'a learner cannot rename themselves');

-- The constraint must still accept every handle already stored, or this
-- migration breaks the next update to an unrelated column.
select is(
  (select count(*)::int from public.profiles
    where handle is not null and handle !~ '^[a-z0-9][a-z0-9_-]{1,22}[a-z0-9]$'),
  0, 'every stored handle satisfies the new constraint');

-- -------------------------------------------------------------------- board
select has_function('public', 'daily_board', 'daily_board exists');

select ok(
  not has_function_privilege('anon', 'public.daily_board(text,int)', 'EXECUTE'),
  'a logged-out visitor cannot enumerate learners');

select ok(
  has_function_privilege('authenticated', 'public.daily_board(text,int)', 'EXECUTE'),
  'a signed-in learner can read the board');

-- Default off. A board somebody joined without noticing is not opt-in.
select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'leaderboard_opt_in'),
  'false', 'nobody is on the board unless they opted in');

-- With no opted-in profiles the board is empty rather than erroring — this is
-- the state the site ships in, so it is the state most worth asserting.
select is(
  (select count(*)::int from public.daily_board('today', 10)),
  0, 'an empty board returns no rows and does not raise');

select * from finish();
rollback;
