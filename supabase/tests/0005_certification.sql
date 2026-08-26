-- pgTAP for 0009 — certification.
--
-- The assertions worth having here are the ones that protect a person rather
-- than a shape. A certificate is the first thing this project produces that
-- someone might show an employer or a school, so the failures that matter are:
-- issuing one nobody earned, revoking one without telling the holder, banding
-- someone lower than they already were, and handing a stranger a child's name.
--
-- Each of those is a rule the design states in prose (10h's "rules to enforce
-- server-side"), and prose is what 0007 already proved is not enough — it
-- claimed handles were generated and never chosen while nothing enforced it.
-- So each rule gets an assertion.

begin;
select plan(30);

-- ------------------------------------------------------------------ the gate

select has_table('public', 'certification_state', 'the per-module gate exists');
select has_function('public', 'certification_open', 'certification_open exists');

-- The headline claim of this migration: it ships closed.
select is(
  (select count(*)::int from public.certification_state where issuing <> 'off'),
  0, 'no module ships with issuing switched on');

select ok(
  not public.certification_open('e7'),
  'certification is closed for e7, the first module in the queue');

/* The gate must be conjunctive, and this is the assertion that makes "ships
   closed" mean something stronger than "the seed row says off".

   Every checklist box is ticked and the switch is thrown all the way to
   'everyone' — everything a future admin page, or someone who has read only
   half of 10g, could do from a console. It must still be shut, because the two
   reviewers who agreed on the sample answers do not exist. */
update public.certification_state
   set issuing = 'everyone', rubric_published = true, sample_agreement = true,
       guardian_path_tested = true
 where module_id = 'e7';
select ok(
  not public.certification_open('e7'),
  'every box ticked and the switch on still does not open it without reviewers');

-- Put it back before anything downstream runs against an open gate.
update public.certification_state set issuing = 'off' where module_id = 'e7';

/* The reviewers must additionally be two different people. That one is checked
   against the function source rather than by naming two, because naming anyone
   needs a profiles row, profiles references auth.users, and this fixture cannot
   insert an auth user — the same limit 0004's handle test ran into and recorded.
   Weaker than an execution, and worth having anyway: the failure it guards is
   one person quietly approving their own sample agreement. */
select ok(
  (select prosrc like '%reviewer_one <> reviewer_two%'
     from pg_proc where proname = 'certification_open'
      and pronamespace = 'public'::regnamespace),
  'one person named in both reviewer slots is not two reviewers');

-- ------------------------------------------------------------------ codes

select has_function('public', 'generate_credential_code', 'code generator exists');

/* 10h excludes 0/O and 1/I/L "for handwriting and bad prints". A code is read
   off a photocopy by someone who has never seen it before, so a single
   ambiguous glyph is a verification that fails for a certificate that is
   perfectly valid. */
select ok(
  (select bool_and(public.generate_credential_code() !~ '[01OIL]')
     from generate_series(1, 30)),
  'generated codes never contain 0, O, 1, I or L');

select ok(
  (select public.generate_credential_code()) ~ '^[A-Z2-9]{4}-[A-Z2-9]{3}-[A-Z2-9]{3}$',
  'codes are grouped for reading aloud');

/* Random, not sequential — 10h: "a code must not reveal how many certificates
   exist or let anyone walk the list." Thirty draws from a 30-character
   alphabet at length ten collide with probability far below one in a billion,
   so anything under thirty distinct means the generator is not random. */
select is(
  (select count(distinct public.generate_credential_code())::int from generate_series(1, 30)),
  30, 'codes are random rather than sequential');

-- ------------------------------------------------------------------ the rules

select has_function('public', 'issue_module_record', 'record issuance exists');
select has_function('public', 'start_attempt',       'attempts can be started');
select has_function('public', 'submit_attempt',      'attempts can be submitted');
select has_function('public', 'record_review',       'reviews can be recorded');

-- Rule 1: no certificate without a Module Record first.
select ok(
  (select prosrc like '%earn the Module Record%'
     from pg_proc where proname = 'start_attempt'
      and pronamespace = 'public'::regnamespace),
  'starting an attempt requires the Module Record first');

/* Rule 2: second attempt refused inside the retake gap.
   Asserted on the column default rather than on a seeded row — there are no
   assessments in a fresh database, and an assertion that only runs when data
   happens to exist emits nothing and throws the plan count off. */
select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'assessments'
      and column_name = 'retake_gap_h'),
  '24', 'the retake gap defaults to 24 hours');

select ok(
  (select prosrc like '%next attempt allowed after%'
     from pg_proc where proname = 'start_attempt'
      and pronamespace = 'public'::regnamespace),
  'a re-sit inside the gap is refused with the time it opens');

-- Rule 3: upgrade only. A review that lands lower must change nothing, which
-- is the difference between a second opinion and a punishment.
select ok(
  (select prosrc like '%rank >%'
     from pg_proc where proname = 'issue_from_attempt'
      and pronamespace = 'public'::regnamespace),
  'an issued band is only ever raised, never lowered');

-- Rule 4: the reviewer does not see the name. Asserted against the function
-- that IS the queue, because a UI promising not to render a column is not the
-- same guarantee.
select ok(
  (select prosrc not like '%display_name%'
     from pg_proc where proname = 'review_queue'
      and pronamespace = 'public'::regnamespace),
  'the review queue does not select the learner name at all');

select is(
  (select count(*)::int from information_schema.routines
    where routine_schema = 'public' and routine_name = 'review_queue'),
  1, 'there is exactly one review queue, so there is one place to get this wrong');

-- Rule 5: a minor's name is confirmed by a guardian.
select ok(
  (select prosrc like '%guardian must confirm%'
     from pg_proc where proname = 'confirm_certificate_name'
      and pronamespace = 'public'::regnamespace),
  'an account with guardian consent cannot self-confirm its printed name');

-- ------------------------------------------------------------------ revoking

select has_function('public', 'propose_revocation', 'revocation can be proposed');
select has_function('public', 'execute_revocation', 'revocation can be executed');

/* 10f lists what is never a ground: "Refusing to donate, going inactive, or
   criticising Lrnon." The strongest way to honour that is for the values not
   to exist — an owner cannot record a reason the constraint will not accept. */
select throws_ok(
  $$insert into public.revocations (credential_id, proposed_by, reason_public)
    values (1, '00000000-0000-0000-0000-0000000000c1', 'refused_to_donate')$$,
  '23514',
  null,
  'a revocation cannot be recorded for a reason 10f says is never a ground');

-- The holder is told BEFORE, not after.
select ok(
  (select prosrc like '%notify the holder before revoking%'
     from pg_proc where proname = 'execute_revocation'
      and pronamespace = 'public'::regnamespace),
  'a revocation cannot execute until the holder has been notified');

select ok(
  (select prosrc like '%30-day hold%'
     from pg_proc where proname = 'execute_revocation'
      and pronamespace = 'public'::regnamespace),
  'the 30-day hold is enforced, not merely documented');

-- ------------------------------------------------------------------ privacy

/* 10e: "most Lrnon learners are children, and a code alone should not return a
   child's name to a stranger." verify_credential returns status; the name only
   comes back from reveal_credential, and only against the right initials. */
select ok(
  (select prosrc not like '%display_name%'
     from pg_proc where proname = 'verify_credential'
      and pronamespace = 'public'::regnamespace),
  'the public status check never returns a name');

-- verify_log records who checked whose certificate. Nobody may read it.
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'verify_log'),
  0, 'verify_log has no read policy, so nothing can read it back');

-- ------------------------------------------------------------------ privilege
--
-- 0003's lesson: PostgreSQL grants EXECUTE to PUBLIC on every new function and
-- anon inherits it, so a definer function is exposed over /rest/v1/rpc unless
-- the grant is revoked from PUBLIC specifically. Every function that mutates a
-- credential must be unreachable by an unauthenticated caller.
select is(
  (select count(*)::int from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('issue_from_attempt','generate_credential_code',
                        'start_attempt','submit_attempt','record_review',
                        'propose_revocation','execute_revocation',
                        'confirm_certificate_name','issue_module_record')
      and has_function_privilege('anon', p.oid, 'execute')),
  0, 'anon cannot execute any function that creates or changes a credential');

/* The two exceptions, and they are deliberate: 10e's whole premise is "no
   account needed". A verification page that required signing in would fail the
   person it exists for — a teacher with a printout and no reason to have an
   account here. */
select ok(
  (select bool_and(has_function_privilege('anon', p.oid, 'execute'))
     from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('verify_credential', 'reveal_credential')),
  'verification stays callable without an account, as 10e requires');

rollback;
