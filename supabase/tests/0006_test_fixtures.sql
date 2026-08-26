-- pgTAP for 0010 — the fixture seeder and, mostly, the deleter.
--
-- One assertion here matters more than the rest: delete_test_fixtures() must
-- never remove a credential that is not a fixture. Everything else is shape
-- checking; that one is the difference between a testing convenience and a way
-- to destroy a learner's certificate from an admin page.
--
-- It is checked twice, because the two guards are independent and either could
-- be removed by a plausible future edit:
--
--   · the deleter only considers rows listed in test_fixtures, and
--   · it re-checks is_fixture on every credential and attempt it reaches.
--
-- The second is tested by corrupting the registry on purpose — pointing it at a
-- real credential — and asserting the row survives. That is the scenario the
-- guard exists for and the only way to know it works.
--
-- Unlike 0005, this file acts as a real owner: it creates an auth user, grants
-- super_admin, and sets the JWT claim, so the owner-only functions actually
-- run. That also puts the auth.users insert the seeder depends on under test,
-- which is worth knowing about here rather than the first time someone presses
-- the button in production.

begin;
select plan(28);

-- ------------------------------------------------------------------- shape

select has_table('public', 'test_fixtures', 'the fixture registry exists');
select has_function('public', 'seed_test_fixtures',   'the seeder exists');
select has_function('public', 'delete_test_fixtures', 'the deleter exists');
select has_function('public', 'list_test_fixtures',   'the listing exists');

select has_column('public', 'credentials',       'is_fixture', 'credentials are markable');
select has_column('public', 'attempts',          'is_fixture', 'attempts are markable');
select has_column('public', 'certificate_names', 'is_fixture', 'names are markable');

/* Default false, everywhere. A column defaulting true would silently mark every
   real credential as test data, which the verify page would then announce to
   the person holding it. */
select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'credentials'
      and column_name = 'is_fixture'),
  'false', 'credentials are real unless explicitly marked otherwise');

-- --------------------------------------------------------------- ownership

select ok(
  not has_function_privilege('anon', 'public.seed_test_fixtures()', 'execute'),
  'anon cannot seed fixtures');
select ok(
  not has_function_privilege('anon', 'public.delete_test_fixtures(text)', 'execute'),
  'anon cannot delete fixtures');

/* The helpers are internals of an owner-only operation, not an API — especially
   the one that creates auth users. */
select is(
  (select count(*)::int from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname like 'seed\_fixture\_%'
      and has_function_privilege('authenticated', p.oid, 'execute')),
  0, 'no signed-in user can call a seed helper directly');

-- ------------------------------------------------------ become a real owner

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-0000000000ff',
  'authenticated', 'authenticated', 'owner@fixture.lrnon.invalid', '',
  now(), now(), now(), '{}'::jsonb, '{}'::jsonb, false);

insert into public.user_roles (user_id, role)
values ('00000000-0000-0000-0000-0000000000ff', 'super_admin');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000ff"}', true);

select ok(public.is_owner(), 'the test actor is an owner, so the guarded paths run');

/* The signup trigger, exercised in passing: the seeder relies on it to create
   each fixture learner's profile and handle. */
select is(
  (select count(*)::int from public.profiles
    where id = '00000000-0000-0000-0000-0000000000ff'),
  1, 'inserting an auth user creates the profile, which is how fixtures get one');

-- --------------------------------------------- a real credential to protect

insert into public.credentials (code, tier, learner_id, module_id, is_fixture)
values ('REAL-AAA-BBB', 'record', '00000000-0000-0000-0000-0000000000ff', 'e1', false);

-- --------------------------------------------------------------- seed it up

select lives_ok(
  $$select public.seed_test_fixtures()$$,
  'seeding runs end to end as an owner');

select cmp_ok(
  (select count(*)::int from public.test_fixtures), '>', 50,
  'seeding registered every row it created');

select cmp_ok(
  (select count(distinct scenario)::int from public.test_fixtures), '>=', 15,
  'all fifteen scenarios plus the shared rows are present');

/* Every band and every credential state, which is the whole reason the fixtures
   exist: 10c and 10e cannot be seen without them. */
select is(
  (select count(distinct state)::int from public.credentials
    where is_fixture and tier = 'certificate'),
  4, 'all four credential states exist: valid, superseded, revoked, withdrawn');

select is(
  (select count(distinct band)::int from public.attempts where is_fixture and band is not null),
  3, 'all three bands exist: not_yet, nearly, secure');

select is(
  (select count(*)::int from public.attempts where is_fixture and state = 'in_progress'),
  1, 'an unfinished attempt exists, for the resume path');

select is(
  (select count(*)::int from public.attempts where is_fixture and state = 'awaiting_review'),
  2, 'two answers wait for a reviewer, including the upgrade-pending one');

/* The guardian rule was exercised rather than bypassed: this row could only
   exist if confirm_certificate_name() accepted it. */
select is(
  (select count(*)::int from public.certificate_names
    where is_fixture and name_confirmed_by = 'guardian'),
  1, 'a minor''s name was confirmed through the guardian path');

/* Nothing the seeder made is unmarked. An unmarked fixture verifies exactly
   like a real certificate. */
select is(
  (select count(*)::int from public.credentials c
    where not c.is_fixture and c.code <> 'REAL-AAA-BBB'),
  0, 'every seeded credential is marked as test data');

-- --------------------------------------------------------- the delete guard

/* Corrupt the registry: point it at the real credential, which is precisely
   the failure guard two exists for. */
insert into public.test_fixtures (scenario, table_name, row_key, label)
select 'corrupted-on-purpose', 'credentials', c.id::text, 'a real credential'
  from public.credentials c where c.code = 'REAL-AAA-BBB';

select is(
  (select skipped_not_fixture from public.delete_test_fixtures('corrupted-on-purpose')),
  1, 'a registered row that is NOT marked as a fixture is reported as skipped');

select is(
  (select count(*)::int from public.credentials where code = 'REAL-AAA-BBB'),
  1, 'and it survives — the registry alone cannot delete a real credential');

-- ------------------------------------------------------------- delete them

select lives_ok(
  $$select public.delete_test_fixtures()$$,
  'deleting every fixture runs cleanly');

select is(
  (select count(*)::int from public.credentials where is_fixture),
  0, 'no fixture credential is left behind');

select is(
  (select count(*)::int from auth.users where email like '%@fixture.lrnon.invalid'
     and id <> '00000000-0000-0000-0000-0000000000ff'),
  0, 'no fixture account is left behind');

select is(
  (select count(*)::int from public.credentials where code = 'REAL-AAA-BBB'),
  1, 'and the real credential is still there after a delete-all');

rollback;
