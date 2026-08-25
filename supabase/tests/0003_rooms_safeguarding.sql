-- pgTAP tests for rooms, doubts and the safeguarding guarantees (0007).
--
-- These assert the properties /safeguarding promises the public. A promise on
-- a policy page that no test enforces is a promise waiting to be broken by a
-- later migration.
begin;
-- 18, not 17. The file has always contained eighteen assertions; the plan
-- said seventeen, so pg_prove reported "Bad plan" and marked the last one
-- failed. Nobody saw it because the db job never ran on a pull request until
-- now — the very failure mode the comment in ci.yml describes.
select plan(18);

-- ---------------------------------------------------- structure
select has_table('public', 'rooms', 'rooms exists');
select has_table('public', 'posts', 'posts exists');
select has_table('public', 'reports', 'reports exists');
select has_table('public', 'rooms_state', 'rooms_state exists');

-- CONDITION 3: no private messaging, ever. The strongest guarantee available
-- is that no table can carry one — a recipient column is the thing to look
-- for, because that is what a DM needs and a public post does not.
select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public'
      and column_name in ('recipient','recipient_id','to_user','to_user_id','dm_to')),
  0, 'no table has a direct-message recipient column');

-- CONDITION 4: no profile field can identify a child.
select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'posts'
      and column_name in ('real_name','school','location','city','photo','avatar_url','age','dob')),
  0, 'posts carry no identifying fields');

-- ---------------------------------------------------- the gate
select ok((select relrowsecurity from pg_class where relname = 'posts' and relnamespace = 'public'::regnamespace), 'RLS on posts');
select ok((select relrowsecurity from pg_class where relname = 'rooms' and relnamespace = 'public'::regnamespace), 'RLS on rooms');
select ok((select relrowsecurity from pg_class where relname = 'reports' and relnamespace = 'public'::regnamespace), 'RLS on reports');

-- Ships closed, and closed means closed: the gate needs BOTH a flag and two
-- named people, so flipping one by accident opens nothing.
select is((select public.rooms_open()), false, 'rooms are closed on arrival');
select is(
  (select count(*)::int from public.rooms_state
    where open = false and safeguarding_owner is null and deputy is null),
  1, 'no safeguarding owner or deputy is set');
select ok(
  (select prosrc like '%safeguarding_owner is not null%' from pg_proc where proname = 'rooms_open' and pronamespace = 'public'::regnamespace),
  'opening requires a named owner, not just a flag');

-- ---------------------------------------------------- moderation
-- CONDITION 2: nothing is visible until a moderator approves it. The default
-- carries that, and moderate_post is the only writer.
select is(
  (select column_default from information_schema.columns
    where table_schema='public' and table_name='posts' and column_name='status'),
  '''pending''::text', 'posts default to pending');

select is(
  (select count(*)::int from pg_policies
    where tablename='posts' and cmd in ('INSERT','UPDATE','DELETE')),
  0, 'no direct write policy on posts — functions are the only path');

select ok(
  not has_table_privilege('authenticated', 'public.posts', 'INSERT'),
  'a signed-in learner cannot insert a post directly');

-- ---------------------------------------------------- reporting
-- CONDITION 5: one-click reporting that works WITHOUT an account. This is the
-- one function anon is meant to reach, so assert it rather than assume it.
select ok(
  has_function_privilege('anon', 'public.report_post(bigint,text,text,boolean)', 'EXECUTE'),
  'reporting works without signing in');

select ok(
  not has_function_privilege('anon', 'public.moderate_post(bigint,text,text)', 'EXECUTE'),
  'anon cannot moderate');

-- CONDITION 7: retention is enforced, not promised.
select has_function('public', 'purge_expired_posts', 'retention purge exists');

select * from finish();
rollback;
