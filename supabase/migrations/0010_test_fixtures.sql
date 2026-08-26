-- 0010 · Certification test fixtures.
--
-- Turn 10 was built against no data. Three of its frames — the three results
-- (10c), the certificate itself (10d), and four of 10e's five verification
-- answers — cannot be seen at all until credentials exist in each state, and a
-- page that has never rendered its own content is not finished, it is untested.
--
-- So this creates one learner and one credential per scenario, covering every
-- band, every credential state, every attempt state, and the two verification
-- edge cases. They are inserted by an owner-only function and removed by
-- another, from the admin portal.
--
-- THE SAFETY PROPERTY, and everything here follows from it:
--
--   delete_test_fixtures() can only ever delete rows this file created.
--
-- It does not match on a name pattern, an email domain, a date range, or an
-- id prefix — every one of those is a heuristic, and a heuristic that deletes
-- credentials is a way to destroy a real learner's certificate. Instead every
-- seeded row is recorded in test_fixtures at the moment it is created, and
-- deletion walks that registry and nothing else. A row that was never
-- registered cannot be reached by the delete path at all.
--
-- The second guard is independent of the first: credentials, attempts and
-- names carry is_fixture, the deleter refuses any credential without it, and
-- the public verification page says so loudly. A test certificate that
-- verifies identically to a real one is a forgery, not a fixture.

-- ------------------------------------------------------------------ marking

alter table public.credentials       add column if not exists is_fixture boolean not null default false;
alter table public.attempts          add column if not exists is_fixture boolean not null default false;
alter table public.certificate_names add column if not exists is_fixture boolean not null default false;

comment on column public.credentials.is_fixture is
  'Seeded test data. Surfaced on the public verify page and printed on the '
  'certificate: a test credential that verifies exactly like a real one would '
  'be a forgery. Never set on a credential issued to a real learner.';

create index if not exists credentials_fixture on public.credentials (is_fixture)
  where is_fixture;

-- ------------------------------------------------------------------ registry

create table if not exists public.test_fixtures (
  id         bigserial primary key,
  scenario   text not null,
  table_name text not null check (table_name in (
    'auth.users', 'profiles', 'lesson_progress', 'assessments', 'attempts',
    'credentials', 'certificate_names', 'reviews', 'revocations', 'verify_log',
    'guardian_consents')),
  row_key    text not null,
  label      text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create index if not exists test_fixtures_scenario on public.test_fixtures (scenario);

comment on table public.test_fixtures is
  'The list of rows the fixture seeder created, and the ONLY thing the deleter '
  'is allowed to consult. Deleting by pattern — an email domain, a name suffix, '
  'a date window — would eventually match a real learner. This cannot: a row '
  'that is not listed here is not reachable by delete_test_fixtures().';
comment on column public.test_fixtures.row_key is
  'Primary key as text, because the tables it points at key on bigint, uuid and '
  'a composite. Read back with the per-table branches in the deleter.';

alter table public.test_fixtures enable row level security;
create policy "fixtures: administrators" on public.test_fixtures
  for select using (public.has_role('admin') or public.is_owner());
revoke insert, update, delete on public.test_fixtures from anon, authenticated;

-- ------------------------------------------------------------------ seeding

/** Create the full scenario set. Owner-only, and repeatable — it clears any
 *  previous fixtures first, so re-running gives the same set rather than a
 *  second copy of it.
 *
 *  Where a real function can do the work, it does. Lesson progress is inserted
 *  and then issue_module_record() is CALLED rather than a credential being
 *  written directly, so the fixture exercises the record precondition instead
 *  of quietly bypassing it — and if that function breaks, seeding fails.
 *
 *  The assessed scenarios are inserted directly, because start_attempt() is
 *  correctly refused by the closed gate and opening it mid-seed to get around
 *  the check would defeat the check.
 */
create or replace function public.seed_test_fixtures()
returns table (scenario_id text, summary text, cred_code text)
language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
declare
  v_actor uuid := auth.uid();
  v_a1 bigint; v_a2 bigint;          -- assessments, syllabus v1 (retired) and v2 (live)
  v_rev1 uuid; v_rev2 uuid;          -- fixture reviewers
  v_id uuid; v_att bigint; v_code text; v_cred bigint;
  v_slugs text[] := array[
    'l1-fluency-is-not-evidence', 'l2-which-claims-need-checking',
    'l3-checking-a-claim-in-two-minutes', 'l4-what-makes-a-source-worth-trusting',
    'l5-when-sources-disagree', 'l6-how-manipulation-finds-you',
    'l7-the-bias-you-bring', 'l8-a-habit-that-holds'];
  s text;

begin
  if not public.is_owner() then
    raise exception 'seed_test_fixtures: owners only';
  end if;

  perform public.delete_test_fixtures();

  -- ---------------------------------------------------------- assessments
  insert into public.assessments (module_id, syllabus_version, method, rubric_id,
                                  time_limit_min, retake_gap_h, state)
  values ('e7', 1, 'auto_human', 'e7-v1', 45, 24, 'retired')
  returning id into v_a1;
  insert into public.test_fixtures (scenario, table_name, row_key, label, created_by)
  values ('_shared', 'assessments', v_a1::text, 'E7 syllabus v1 (retired)', v_actor);

  insert into public.assessments (module_id, syllabus_version, method, rubric_id,
                                  time_limit_min, retake_gap_h, state)
  values ('e7', 2, 'auto_human', 'e7-v2', 45, 24, 'live')
  returning id into v_a2;
  insert into public.test_fixtures (scenario, table_name, row_key, label, created_by)
  values ('_shared', 'assessments', v_a2::text, 'E7 syllabus v2 (live)', v_actor);

  -- ------------------------------------------------------------ reviewers
  v_rev1 := public.seed_fixture_learner('reviewer-one', '_shared', 'Fixture reviewer one');
  v_rev2 := public.seed_fixture_learner('reviewer-two', '_shared', 'Fixture reviewer two');

  -- =========================================================== scenarios ==

  -- 1 · A Module Record, issued by the real function against real progress.
  v_id := public.seed_fixture_learner('ananya', 'record-valid', 'Ananya Ravi Kumar');
  foreach s in array v_slugs loop
    perform public.seed_fixture_progress(v_id, 'explorer/e7/' || s, 'record-valid');
  end loop;
  v_code := public.seed_fixture_record(v_id, 'e7', 'record-valid');
  return query select 'record-valid'::text,
    'Module Record for E7, issued by issue_module_record() against eight completed lessons'::text, v_code;

  -- 2 · Secure, human-reviewed. The certificate 10d draws.
  perform public.seed_fixture_name(v_id, 'Ananya Ravi Kumar', 'self', 'cert-secure-reviewed');
  v_att := public.seed_fixture_attempt(v_id, v_a2, 17, 20, 'secure', 'rubric', 'graded',
    'I would ask what turns on it first. If the figure only decorates a slide, I would drop it rather than spend the afternoon. If a decision rests on it, I would find the original release and read the sentence in place — a second article repeating it is not a check. What I would still not know is whether their definition matches ours.',
    'cert-secure-reviewed');
  perform public.seed_fixture_review(v_att, v_rev1,
    array['secure','secure','nearly','secure'],
    array['','','Names a risk but does not locate it in this claim.',''],
    'cert-secure-reviewed');
  v_code := public.seed_fixture_credential(v_id, 'e7', v_att, 2, 'secure',
    'Auto-marked + human review', 'cert-secure-reviewed', 'valid');
  return query select 'cert-secure-reviewed'::text,
    'Lrnon Certificate, band secure, banded by a reviewer against the four criteria'::text, v_code;

  -- 3 · Nearly, banded on score. 10c's middle result: record issued, certificate
  --     still open, nothing lost.
  v_id := public.seed_fixture_learner('bilal', 'cert-nearly-on-score', 'Bilal Ahmed');
  foreach s in array v_slugs loop
    perform public.seed_fixture_progress(v_id, 'explorer/e7/' || s, 'cert-nearly-on-score');
  end loop;
  perform public.seed_fixture_record(v_id, 'e7', 'cert-nearly-on-score');
  perform public.seed_fixture_name(v_id, 'Bilal Ahmed', 'self', 'cert-nearly-on-score');
  v_att := public.seed_fixture_attempt(v_id, v_a2, 14, 20, 'nearly', 'score', 'graded',
    'They should take the 5600 because it is more money.', 'cert-nearly-on-score');
  v_code := public.seed_fixture_credential(v_id, 'e7', v_att, 2, 'nearly',
    'Auto-marked', 'cert-nearly-on-score', 'valid');
  return query select 'cert-nearly-on-score'::text,
    'Certificate at nearly, banded on score with no reviewer — the upgrade is still available'::text, v_code;

  -- 4 · Not yet. 10c: issues nothing, recorded nowhere public, nobody told.
  v_id := public.seed_fixture_learner('chen', 'attempt-not-yet', 'Chen Wei');
  foreach s in array v_slugs loop
    perform public.seed_fixture_progress(v_id, 'explorer/e7/' || s, 'attempt-not-yet');
  end loop;
  perform public.seed_fixture_record(v_id, 'e7', 'attempt-not-yet');
  perform public.seed_fixture_name(v_id, 'Chen Wei', 'self', 'attempt-not-yet');
  v_att := public.seed_fixture_attempt(v_id, v_a2, 8, 20, 'not_yet', 'rubric', 'graded',
    'It is true because it was in the report.', 'attempt-not-yet');
  perform public.seed_fixture_review(v_att, v_rev1,
    array['not_yet','not_yet','not_yet','nearly'],
    array['No sense of what turns on the claim.','Accepts a restatement as a source.',
          'No risk identified.','Reads as lesson text rather than reasoning.'],
    'attempt-not-yet');
  return query select 'attempt-not-yet'::text,
    'A graded attempt at not_yet — the Module Record stands, NO certificate exists, nothing is public'::text, null::text;

  -- 5 · Superseded. 10e's second answer: still genuine, syllabus moved on.
  v_id := public.seed_fixture_learner('divya', 'cert-superseded', 'Divya Menon');
  foreach s in array v_slugs loop
    perform public.seed_fixture_progress(v_id, 'explorer/e7/' || s, 'cert-superseded');
  end loop;
  perform public.seed_fixture_record(v_id, 'e7', 'cert-superseded');
  perform public.seed_fixture_name(v_id, 'Divya Menon', 'self', 'cert-superseded');
  v_att := public.seed_fixture_attempt(v_id, v_a1, 18, 20, 'secure', 'rubric', 'graded',
    'I would check what rests on it before checking the claim itself.', 'cert-superseded');
  v_code := public.seed_fixture_credential(v_id, 'e7', v_att, 1, 'secure',
    'Auto-marked + human review', 'cert-superseded', 'superseded');
  return query select 'cert-superseded'::text,
    'Certificate assessed on syllabus v1, superseded by v2 — valid, and a free re-sit is owed'::text, v_code;

  -- 6 · Revoked for an assessment defect. 10f: our fault, everyone told, re-sit free.
  v_id := public.seed_fixture_learner('emeka', 'cert-revoked', 'Emeka Okafor');
  foreach s in array v_slugs loop
    perform public.seed_fixture_progress(v_id, 'explorer/e7/' || s, 'cert-revoked');
  end loop;
  perform public.seed_fixture_record(v_id, 'e7', 'cert-revoked');
  perform public.seed_fixture_name(v_id, 'Emeka Okafor', 'self', 'cert-revoked');
  v_att := public.seed_fixture_attempt(v_id, v_a2, 16, 20, 'secure', 'rubric', 'graded',
    'A written answer that was banded against a defective question.', 'cert-revoked');
  v_code := public.seed_fixture_credential(v_id, 'e7', v_att, 2, 'secure',
    'Auto-marked + human review', 'cert-revoked', 'revoked');
  select id into v_cred from public.credentials where code = v_code;
  perform public.seed_fixture_revocation(v_cred, v_actor, 'assessment_defect',
    now() - interval '31 days', now() - interval '31 days', now() - interval '1 day', 'cert-revoked');
  return query select 'cert-revoked'::text,
    'Revoked for an assessment defect — executed after the hold, holder notified first'::text, v_code;

  -- 7 · Withdrawn at the holder's request. Honoured without asking why.
  v_id := public.seed_fixture_learner('farah', 'cert-withdrawn', 'Farah Siddiqui');
  foreach s in array v_slugs loop
    perform public.seed_fixture_progress(v_id, 'explorer/e7/' || s, 'cert-withdrawn');
  end loop;
  perform public.seed_fixture_record(v_id, 'e7', 'cert-withdrawn');
  perform public.seed_fixture_name(v_id, 'Farah Siddiqui', 'self', 'cert-withdrawn');
  v_att := public.seed_fixture_attempt(v_id, v_a2, 19, 20, 'secure', 'rubric', 'graded',
    'A perfectly good answer from someone who later asked us to take it down.', 'cert-withdrawn');
  v_code := public.seed_fixture_credential(v_id, 'e7', v_att, 2, 'secure',
    'Auto-marked + human review', 'cert-withdrawn', 'withdrawn');
  return query select 'cert-withdrawn'::text,
    'Withdrawn at the holder''s request — implies nothing about the work'::text, v_code;

  -- 8 · An attempt in progress. 10b's resume case.
  v_id := public.seed_fixture_learner('gita', 'attempt-in-progress', 'Gita Sharma');
  foreach s in array v_slugs loop
    perform public.seed_fixture_progress(v_id, 'explorer/e7/' || s, 'attempt-in-progress');
  end loop;
  perform public.seed_fixture_record(v_id, 'e7', 'attempt-in-progress');
  perform public.seed_fixture_attempt(v_id, v_a2, null, null, null, null, 'in_progress',
    null, 'attempt-in-progress');
  return query select 'attempt-in-progress'::text,
    'An unfinished attempt — start_attempt() must resume this one, not open a second'::text, null::text;

  -- 9 · Awaiting review. The row 10f's queue is built around.
  v_id := public.seed_fixture_learner('hassan', 'attempt-awaiting-review', 'Hassan Malik');
  foreach s in array v_slugs loop
    perform public.seed_fixture_progress(v_id, 'explorer/e7/' || s, 'attempt-awaiting-review');
  end loop;
  perform public.seed_fixture_record(v_id, 'e7', 'attempt-awaiting-review');
  perform public.seed_fixture_name(v_id, 'Hassan Malik', 'self', 'attempt-awaiting-review');
  perform public.seed_fixture_attempt(v_id, v_a2, 17, 20, null, null, 'awaiting_review',
    'I would start by asking whether anything actually depends on the number. Most forwarded statistics decorate an argument rather than carry it, and checking those is a way of looking busy. If it does carry the argument, the original release is the only thing worth opening.',
    'attempt-awaiting-review');
  return query select 'attempt-awaiting-review'::text,
    'A written answer waiting for a reviewer — appears in review_queue() with NO learner name attached'::text, null::text;

  -- 10 · Issued on score while review was paused, upgrade still pending.
  --      10b: "if they band you higher, your certificate is upgraded automatically."
  v_id := public.seed_fixture_learner('ines', 'cert-upgrade-pending', 'Inés Duarte');
  foreach s in array v_slugs loop
    perform public.seed_fixture_progress(v_id, 'explorer/e7/' || s, 'cert-upgrade-pending');
  end loop;
  perform public.seed_fixture_record(v_id, 'e7', 'cert-upgrade-pending');
  perform public.seed_fixture_name(v_id, 'Inés Duarte', 'self', 'cert-upgrade-pending');
  v_att := public.seed_fixture_attempt(v_id, v_a2, 15, 20, 'nearly', 'score', 'awaiting_review',
    'An answer issued at nearly on score, still queued for a human read that can only raise it.',
    'cert-upgrade-pending');
  v_code := public.seed_fixture_credential(v_id, 'e7', v_att, 2, 'nearly',
    'Auto-marked', 'cert-upgrade-pending', 'valid');
  return query select 'cert-upgrade-pending'::text,
    'Issued at nearly under load; a reviewer can raise it to secure and never lower it'::text, v_code;

  -- 11 · A minor, name confirmed by a guardian. 10h's fifth rule.
  v_id := public.seed_fixture_learner('jonas', 'name-guardian', 'Jonas Beck (age 11)');
  perform public.seed_fixture_consent(v_id, 'name-guardian');
  foreach s in array v_slugs loop
    perform public.seed_fixture_progress(v_id, 'explorer/e7/' || s, 'name-guardian');
  end loop;
  perform public.seed_fixture_record(v_id, 'e7', 'name-guardian');
  perform public.seed_fixture_name(v_id, 'Jonas Beck', 'guardian', 'name-guardian');
  return query select 'name-guardian'::text,
    'A learner with live guardian consent — confirm_certificate_name() REFUSES self-confirmation for this account'::text, null::text;

  -- 12 · A submitted attempt inside the retake gap.
  v_id := public.seed_fixture_learner('kavya', 'attempt-inside-retake-gap', 'Kavya Nair');
  foreach s in array v_slugs loop
    perform public.seed_fixture_progress(v_id, 'explorer/e7/' || s, 'attempt-inside-retake-gap');
  end loop;
  perform public.seed_fixture_record(v_id, 'e7', 'attempt-inside-retake-gap');
  perform public.seed_fixture_attempt_at(v_id, v_a2, now() - interval '2 hours',
    11, 20, 'not_yet', 'score', 'graded', 'Submitted two hours ago.', 'attempt-inside-retake-gap');
  return query select 'attempt-inside-retake-gap'::text,
    'Submitted 2 hours ago — start_attempt() must refuse and name the hour the next one opens'::text, null::text;

  -- 13 · A Module Record on a module that carries no assessment at all.
  v_id := public.seed_fixture_learner('liam', 'record-other-module', 'Liam O''Connor');
  for i in 1..8 loop
    perform public.seed_fixture_progress(v_id, 'explorer/e4/fixture-lesson-' || i, 'record-other-module');
  end loop;
  v_code := public.seed_fixture_record(v_id, 'e4', 'record-other-module');
  return query select 'record-other-module'::text,
    'A Module Record for E4, which has no assessment — records do not depend on certification being open'::text, v_code;

  -- 14 · A code cooled by three wrong initials. 10e's rate limit.
  v_id := public.seed_fixture_learner('mira', 'verify-cooled', 'Mira Kapoor');
  foreach s in array v_slugs loop
    perform public.seed_fixture_progress(v_id, 'explorer/e7/' || s, 'verify-cooled');
  end loop;
  perform public.seed_fixture_record(v_id, 'e7', 'verify-cooled');
  perform public.seed_fixture_name(v_id, 'Mira Kapoor', 'self', 'verify-cooled');
  v_att := public.seed_fixture_attempt(v_id, v_a2, 18, 20, 'secure', 'rubric', 'graded',
    'An answer whose code someone has been guessing at.', 'verify-cooled');
  v_code := public.seed_fixture_credential(v_id, 'e7', v_att, 2, 'secure',
    'Auto-marked + human review', 'verify-cooled', 'valid');
  for i in 1..3 loop
    perform public.seed_fixture_verify_log(v_code, 'verify-cooled');
  end loop;
  return query select 'verify-cooled'::text,
    'Valid certificate with three wrong initials logged — reveal is cooled for an hour, status still answers'::text, v_code;

  -- 15 · A revocation proposed and waiting on an owner. 10f's "needs owner" row.
  v_id := public.seed_fixture_learner('noor', 'revocation-proposed', 'Noor Al-Amin');
  foreach s in array v_slugs loop
    perform public.seed_fixture_progress(v_id, 'explorer/e7/' || s, 'revocation-proposed');
  end loop;
  perform public.seed_fixture_record(v_id, 'e7', 'revocation-proposed');
  perform public.seed_fixture_name(v_id, 'Noor Al-Amin', 'self', 'revocation-proposed');
  v_att := public.seed_fixture_attempt(v_id, v_a2, 16, 20, 'secure', 'rubric', 'graded',
    'An answer under question for a shared account.', 'revocation-proposed');
  v_code := public.seed_fixture_credential(v_id, 'e7', v_att, 2, 'secure',
    'Auto-marked + human review', 'revocation-proposed', 'valid');
  select id into v_cred from public.credentials where code = v_code;
  perform public.seed_fixture_revocation(v_cred, v_actor, 'impersonation_or_shared_account',
    now() + interval '29 days', null, null, 'revocation-proposed');
  return query select 'revocation-proposed'::text,
    'Proposed, inside the 30-day hold, holder NOT yet notified — execute_revocation() must refuse'::text, v_code;

  insert into public.admin_audit (actor, action, detail)
  values (v_actor, 'seed_test_fixtures',
          jsonb_build_object('rows', (select count(*) from public.test_fixtures)));
end $$;

-- ------------------------------------------------------------- seed helpers
--
-- Each one does exactly two things: create the row, and register it. They are
-- separate functions rather than inline blocks so that registration cannot be
-- forgotten in one branch — an unregistered row is an undeletable row, which is
-- the failure mode this whole file is designed against.

create or replace function public.seed_fixture_learner(
  p_slug text, p_scenario text, p_label text)
returns uuid language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
declare v_id uuid := gen_random_uuid();
begin
  /* A real auth user, so the signup trigger creates the profile and generates
     the handle exactly as it would for a learner. The address is at .invalid,
     which RFC 2606 reserves and no real domain can ever be — so a fixture
     account can never collide with, or be mistaken for, a person's. */
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin)
  values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    p_slug || '@fixture.lrnon.invalid', '',
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false);

  insert into public.test_fixtures (scenario, table_name, row_key, label, created_by)
  values (p_scenario, 'auth.users', v_id::text, p_label, auth.uid());
  /* The profile is created by the trigger, not by us, and is registered so the
     deleter accounts for it — though deleting the auth user cascades to it. */
  insert into public.test_fixtures (scenario, table_name, row_key, label, created_by)
  values (p_scenario, 'profiles', v_id::text, p_label, auth.uid());
  return v_id;
end $$;

create or replace function public.seed_fixture_progress(
  p_learner uuid, p_slug text, p_scenario text)
returns void language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
begin
  insert into public.lesson_progress (user_id, lesson_slug, content_hash, status, completed_at)
  values (p_learner, p_slug, 'fixture', 'completed', now() - interval '3 days')
  on conflict (user_id, lesson_slug) do nothing;
  insert into public.test_fixtures (scenario, table_name, row_key, label, created_by)
  values (p_scenario, 'lesson_progress', p_learner::text || '|' || p_slug, p_slug, auth.uid());
end $$;

/** Issue the record through the REAL function, by borrowing the learner's
 *  identity for the length of one statement.
 *
 *  set_config with is_local = true confines the claim to this transaction, and
 *  it is reset immediately after. The point of going through
 *  issue_module_record() rather than inserting a credential is that the fixture
 *  then depends on the same precondition a learner does: if the lesson count is
 *  short, seeding fails here rather than producing a record nobody earned.
 */
create or replace function public.seed_fixture_record(
  p_learner uuid, p_module text, p_scenario text)
returns text language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
declare v_code text; v_id bigint; v_saved text;
begin
  v_saved := current_setting('request.jwt.claims', true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_learner::text)::text, true);
  v_code := public.issue_module_record(p_module, 8);
  perform set_config('request.jwt.claims', coalesce(v_saved, ''), true);

  update public.credentials set is_fixture = true where code = v_code
    returning id into v_id;
  insert into public.test_fixtures (scenario, table_name, row_key, label, created_by)
  values (p_scenario, 'credentials', v_id::text, 'Module Record ' || v_code, auth.uid());
  return v_code;
end $$;

create or replace function public.seed_fixture_name(
  p_learner uuid, p_name text, p_by text, p_scenario text)
returns void language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
declare v_saved text;
begin
  v_saved := current_setting('request.jwt.claims', true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_learner::text)::text, true);
  /* Through the real function, so the guardian rule is exercised rather than
     bypassed: the 'name-guardian' fixture would fail to seed if that check
     ever stopped working. */
  perform public.confirm_certificate_name(p_name, p_by);
  perform set_config('request.jwt.claims', coalesce(v_saved, ''), true);

  update public.certificate_names set is_fixture = true where learner_id = p_learner;
  insert into public.test_fixtures (scenario, table_name, row_key, label, created_by)
  values (p_scenario, 'certificate_names', p_learner::text, p_name, auth.uid());
end $$;

create or replace function public.seed_fixture_consent(p_learner uuid, p_scenario text)
returns void language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
begin
  insert into public.guardian_consents
    (subject_user, scope, guardian_email, granted_at, policy_version, note)
  values (p_learner, 'account', 'guardian@fixture.lrnon.invalid', now(), 'fixture',
          'Seeded fixture. Not a real family.');
  insert into public.test_fixtures (scenario, table_name, row_key, label, created_by)
  values (p_scenario, 'guardian_consents', p_learner::text, 'guardian consent', auth.uid());
end $$;

create or replace function public.seed_fixture_attempt_at(
  p_learner uuid, p_assessment bigint, p_when timestamptz, p_score int, p_max int,
  p_band text, p_src text, p_state text, p_written text, p_scenario text)
returns bigint language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
declare v_id bigint;
begin
  insert into public.attempts (assessment_id, learner_id, started_at, submitted_at,
                               auto_score, auto_max, written_answer, band, band_source,
                               state, is_fixture)
  values (p_assessment, p_learner, p_when - interval '40 minutes',
          case when p_state = 'in_progress' then null else p_when end,
          p_score, p_max, p_written, p_band, p_src, p_state, true)
  returning id into v_id;
  insert into public.test_fixtures (scenario, table_name, row_key, label, created_by)
  values (p_scenario, 'attempts', v_id::text, 'attempt · ' || p_state, auth.uid());
  return v_id;
end $$;

create or replace function public.seed_fixture_attempt(
  p_learner uuid, p_assessment bigint, p_score int, p_max int,
  p_band text, p_src text, p_state text, p_written text, p_scenario text)
returns bigint language sql volatile security definer
set search_path = pg_catalog, public as $$
  select public.seed_fixture_attempt_at(p_learner, p_assessment, now() - interval '2 days',
    p_score, p_max, p_band, p_src, p_state, p_written, p_scenario);
$$;

create or replace function public.seed_fixture_review(
  p_attempt bigint, p_reviewer uuid, p_bands text[], p_notes text[], p_scenario text)
returns void language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
declare v_id bigint;
begin
  insert into public.reviews (attempt_id, reviewer_id, criterion_bands, notes)
  values (p_attempt, p_reviewer, p_bands, p_notes) returning id into v_id;
  insert into public.test_fixtures (scenario, table_name, row_key, label, created_by)
  values (p_scenario, 'reviews', v_id::text, 'review of attempt ' || p_attempt, auth.uid());
end $$;

create or replace function public.seed_fixture_credential(
  p_learner uuid, p_module text, p_attempt bigint, p_version int,
  p_band text, p_method text, p_scenario text, p_state text)
returns text language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
declare v_code text; v_id bigint; v_reviewer text; v_name record;
begin
  v_code := public.generate_credential_code();
  select display_name, name_initials, name_confirmed_by into v_name
    from public.certificate_names where learner_id = p_learner;
  select p.handle into v_reviewer from public.reviews r
    join public.profiles p on p.id = r.reviewer_id
   where r.attempt_id = p_attempt order by r.decided_at desc limit 1;

  insert into public.credentials
    (code, tier, learner_id, module_id, attempt_id, display_name, name_initials,
     name_confirmed_by, issued_at, syllabus_version, method_shown, reviewer_handle,
     state, is_fixture)
  values (v_code, 'certificate', p_learner, p_module, p_attempt,
          v_name.display_name, v_name.name_initials, v_name.name_confirmed_by,
          now() - interval '2 days', p_version, p_method, v_reviewer, p_state, true)
  returning id into v_id;

  insert into public.test_fixtures (scenario, table_name, row_key, label, created_by)
  values (p_scenario, 'credentials', v_id::text,
          'Certificate ' || v_code || ' · ' || p_band || ' · ' || p_state, auth.uid());
  return v_code;
end $$;

create or replace function public.seed_fixture_revocation(
  p_credential bigint, p_actor uuid, p_reason text, p_hold timestamptz,
  p_notified timestamptz, p_executed timestamptz, p_scenario text)
returns void language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
declare v_id bigint;
begin
  insert into public.revocations (credential_id, proposed_by, decided_by, reason_public,
                                  reason_private, hold_until, learner_notified_at, executed_at)
  values (p_credential, p_actor, case when p_executed is null then null else p_actor end,
          p_reason, 'Seeded fixture.', p_hold, p_notified, p_executed)
  returning id into v_id;
  insert into public.test_fixtures (scenario, table_name, row_key, label, created_by)
  values (p_scenario, 'revocations', v_id::text, 'revocation · ' || p_reason, auth.uid());
end $$;

create or replace function public.seed_fixture_verify_log(p_code text, p_scenario text)
returns void language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
declare v_id bigint;
begin
  insert into public.verify_log (code, ip_hash, initials_attempts)
  values (p_code, 'fixture', 1) returning id into v_id;
  insert into public.test_fixtures (scenario, table_name, row_key, label, created_by)
  values (p_scenario, 'verify_log', v_id::text, 'wrong initials on ' || p_code, auth.uid());
end $$;

-- ------------------------------------------------------------------ deleting

/** Remove fixtures. Owner-only.
 *
 *  Walks test_fixtures and nothing else. Pass a scenario to remove one; pass
 *  nothing to remove all.
 *
 *  Two independent guards, because one is a single edit away from being wrong:
 *
 *    1. Only registered rows are considered at all.
 *    2. Any credential or attempt reached is re-checked for is_fixture, and a
 *       row without it is skipped and counted. If the registry were ever
 *       corrupted to point at a real learner's certificate, this is what stops
 *       it — and the count coming back non-zero is the signal that something
 *       is wrong.
 *
 *  Deletion order is FK-safe: dependent rows first, auth users last, since
 *  deleting a user cascades to their profile, progress, attempts and
 *  credentials anyway.
 */
create or replace function public.delete_test_fixtures(p_scenario text default null)
returns table (deleted_rows int, skipped_not_fixture int)
language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
declare
  v_actor uuid := auth.uid();
  r record;
  v_deleted int := 0;
  v_skipped int := 0;
  v_parts text[];
begin
  if not public.is_owner() then
    raise exception 'delete_test_fixtures: owners only';
  end if;

  for r in
    select * from public.test_fixtures
     where p_scenario is null or scenario = p_scenario
     order by array_position(
       array['verify_log','revocations','reviews','credentials','certificate_names',
             'attempts','lesson_progress','guardian_consents','assessments',
             'profiles','auth.users'],
       table_name)
  loop
    if r.table_name = 'verify_log' then
      delete from public.verify_log where id = r.row_key::bigint;

    elsif r.table_name = 'revocations' then
      delete from public.revocations where id = r.row_key::bigint;

    elsif r.table_name = 'reviews' then
      delete from public.reviews where id = r.row_key::bigint;

    elsif r.table_name = 'credentials' then
      -- Guard two. A registered id that is not marked as a fixture is left
      -- alone and counted, never deleted on the registry's word alone.
      if exists (select 1 from public.credentials
                  where id = r.row_key::bigint and is_fixture) then
        delete from public.credentials where id = r.row_key::bigint;
      elsif exists (select 1 from public.credentials where id = r.row_key::bigint) then
        v_skipped := v_skipped + 1;
        continue;
      end if;

    elsif r.table_name = 'certificate_names' then
      delete from public.certificate_names
       where learner_id = r.row_key::uuid and is_fixture;

    elsif r.table_name = 'attempts' then
      if exists (select 1 from public.attempts
                  where id = r.row_key::bigint and is_fixture) then
        delete from public.attempts where id = r.row_key::bigint;
      elsif exists (select 1 from public.attempts where id = r.row_key::bigint) then
        v_skipped := v_skipped + 1;
        continue;
      end if;

    elsif r.table_name = 'lesson_progress' then
      v_parts := string_to_array(r.row_key, '|');
      delete from public.lesson_progress
       where user_id = v_parts[1]::uuid and lesson_slug = v_parts[2]
         and content_hash = 'fixture';

    elsif r.table_name = 'guardian_consents' then
      delete from public.guardian_consents
       where subject_user = r.row_key::uuid and policy_version = 'fixture';

    elsif r.table_name = 'assessments' then
      delete from public.assessments where id = r.row_key::bigint;

    elsif r.table_name = 'profiles' then
      -- Cascades from auth.users; nothing to do but account for the row.
      null;

    elsif r.table_name = 'auth.users' then
      delete from auth.users where id = r.row_key::uuid
        and email like '%@fixture.lrnon.invalid';
    end if;

    v_deleted := v_deleted + 1;
    delete from public.test_fixtures where id = r.id;
  end loop;

  insert into public.admin_audit (actor, action, detail)
  values (v_actor, 'delete_test_fixtures',
          jsonb_build_object('scenario', coalesce(p_scenario, 'all'),
                             'deleted', v_deleted, 'skipped', v_skipped));

  return query select v_deleted, v_skipped;
end $$;

/** What exists, for the admin portal. Grouped by scenario, newest first. */
create or replace function public.list_test_fixtures()
returns table (scenario_id text, row_count int, codes text[], labels text[])
language sql stable security definer
set search_path = pg_catalog, public as $$
  select f.scenario,
         count(*)::int,
         coalesce(array_agg(c.code) filter (where c.code is not null), '{}'),
         array_agg(f.label) filter (where f.label is not null)
    from public.test_fixtures f
    left join public.credentials c
      on f.table_name = 'credentials' and c.id::text = f.row_key
   where public.has_role('admin') or public.is_owner()
   group by f.scenario
   order by f.scenario;
$$;

-- ---------------------------------------------------------------- privileges

revoke execute on function public.seed_test_fixtures() from public, anon;
grant  execute on function public.seed_test_fixtures() to authenticated, service_role;

revoke execute on function public.delete_test_fixtures(text) from public, anon;
grant  execute on function public.delete_test_fixtures(text) to authenticated, service_role;

revoke execute on function public.list_test_fixtures() from public, anon;
grant  execute on function public.list_test_fixtures() to authenticated, service_role;

/* The seed helpers are building blocks of an owner-only operation and are not
   an API. Nothing outside seed_test_fixtures() should reach them — in
   particular seed_fixture_learner(), which creates auth users. */
revoke execute on function public.seed_fixture_learner(text,text,text) from public, anon, authenticated;
revoke execute on function public.seed_fixture_progress(uuid,text,text) from public, anon, authenticated;
revoke execute on function public.seed_fixture_record(uuid,text,text) from public, anon, authenticated;
revoke execute on function public.seed_fixture_name(uuid,text,text,text) from public, anon, authenticated;
revoke execute on function public.seed_fixture_consent(uuid,text) from public, anon, authenticated;
revoke execute on function public.seed_fixture_attempt(uuid,bigint,int,int,text,text,text,text,text) from public, anon, authenticated;
revoke execute on function public.seed_fixture_attempt_at(uuid,bigint,timestamptz,int,int,text,text,text,text,text) from public, anon, authenticated;
revoke execute on function public.seed_fixture_review(bigint,uuid,text[],text[],text) from public, anon, authenticated;
revoke execute on function public.seed_fixture_credential(uuid,text,bigint,int,text,text,text,text) from public, anon, authenticated;
revoke execute on function public.seed_fixture_revocation(bigint,uuid,text,timestamptz,timestamptz,timestamptz,text) from public, anon, authenticated;
revoke execute on function public.seed_fixture_verify_log(text,text) from public, anon, authenticated;

-- ------------------------------------------------- surfacing the fixture flag
--
-- The verification endpoint must say when a credential is seeded. This is the
-- whole reason is_fixture exists rather than the registry alone being enough:
-- a test certificate that verifies identically to a real one is a forgery, and
-- these are going into the same database as real ones.

/* Adding a column to a RETURNS TABLE signature is a return-type change, which
   CREATE OR REPLACE refuses (42P13). Drop and recreate, then re-grant — the
   grants do not survive the drop. */
drop function if exists public.verify_credential(text);

create function public.verify_credential(p_code text)
returns table (found boolean, tier text, module_id text,
               syllabus_version int, issued_at timestamptz, state text,
               is_fixture boolean)
language sql stable security definer
set search_path = pg_catalog, public as $$
  select c.id is not null, c.tier, c.module_id, c.syllabus_version, c.issued_at,
         c.state, coalesce(c.is_fixture, false)
    from (select 1) _
    left join public.credentials c on c.code = upper(btrim(p_code));
$$;

revoke execute on function public.verify_credential(text) from public;
grant  execute on function public.verify_credential(text) to anon, authenticated, service_role;
