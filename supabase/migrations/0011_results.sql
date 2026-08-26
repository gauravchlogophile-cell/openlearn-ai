-- 0011 · Reading a result back.
--
-- 10c is three results — secure, nearly, not yet — and it was the one frame of
-- turn 10 left unbuilt, because a results page with no results is a mock-up.
-- 0010's fixtures fixed that, so this is the query behind the page.
--
-- The shape is the same for all three outcomes on purpose. "Not yet" is not a
-- different, sadder page: it carries the same structure with different content,
-- because 10c is explicit that not-yet is "a normal part of this" rather than a
-- failure screen. What changes is what is offered next.

/** A learner's own latest attempt on a module, with everything the result page
 *  shows.
 *
 *  Own only. There is no parameter for whose result to read: it is always
 *  auth.uid(), so no argument exists that could be tampered with to read
 *  someone else's band.
 */
create or replace function public.my_result(p_module text)
returns table (
  attempt_id     bigint,
  band           text,
  band_source    text,
  auto_score     int,
  auto_max       int,
  state          text,
  submitted_at   timestamptz,
  retake_at      timestamptz,
  criterion_bands text[],
  reviewer_notes  text[],
  credential_code text,
  credential_tier text,
  record_code     text)
language sql stable security definer
set search_path = pg_catalog, public as $$
  with mine as (
    select a.*, s.retake_gap_h
      from public.attempts a
      join public.assessments s on s.id = a.assessment_id
     where a.learner_id = auth.uid() and s.module_id = p_module
     order by a.started_at desc
     limit 1
  )
  select
    m.id, m.band, m.band_source, m.auto_score, m.auto_max, m.state, m.submitted_at,
    m.submitted_at + make_interval(hours => m.retake_gap_h),
    r.criterion_bands,
    r.notes,
    (select c.code from public.credentials c
      where c.learner_id = auth.uid() and c.module_id = p_module
        and c.tier = 'certificate'),
    (select c.tier from public.credentials c
      where c.learner_id = auth.uid() and c.module_id = p_module
        and c.tier = 'certificate'),
    (select c.code from public.credentials c
      where c.learner_id = auth.uid() and c.module_id = p_module
        and c.tier = 'record')
  from mine m
  left join lateral (
    select rv.criterion_bands, rv.notes from public.reviews rv
     where rv.attempt_id = m.id order by rv.decided_at desc limit 1
  ) r on true;
$$;

comment on function public.my_result(text) is
  'Takes no learner argument on purpose. A results endpoint that accepted an id '
  'would be one bad authorisation check away from disclosing another learner''s '
  'band, and most of them are children.';

/** The same shape, for an administrator previewing a seeded scenario.
 *
 *  Restricted twice over: the caller must be an administrator, AND the attempt
 *  must be marked as a fixture. The second condition is what makes this safe to
 *  exist at all — it cannot return a real learner's result to anyone, including
 *  an owner, because a real attempt simply does not match.
 *
 *  It exists because the fixtures are useless if nobody can look at what they
 *  render. There is no way to sign in as a seeded learner (they have no
 *  password, deliberately), so without this the three results of 10c could be
 *  created but never seen.
 */
create or replace function public.fixture_result(p_attempt bigint)
returns table (
  attempt_id     bigint,
  band           text,
  band_source    text,
  auto_score     int,
  auto_max       int,
  state          text,
  submitted_at   timestamptz,
  retake_at      timestamptz,
  criterion_bands text[],
  reviewer_notes  text[],
  credential_code text,
  credential_tier text,
  record_code     text)
language sql stable security definer
set search_path = pg_catalog, public as $$
  select
    a.id, a.band, a.band_source, a.auto_score, a.auto_max, a.state, a.submitted_at,
    a.submitted_at + make_interval(hours => s.retake_gap_h),
    r.criterion_bands,
    r.notes,
    (select c.code from public.credentials c
      where c.learner_id = a.learner_id and c.module_id = s.module_id
        and c.tier = 'certificate'),
    (select c.tier from public.credentials c
      where c.learner_id = a.learner_id and c.module_id = s.module_id
        and c.tier = 'certificate'),
    (select c.code from public.credentials c
      where c.learner_id = a.learner_id and c.module_id = s.module_id
        and c.tier = 'record')
  from public.attempts a
  join public.assessments s on s.id = a.assessment_id
  left join lateral (
    select rv.criterion_bands, rv.notes from public.reviews rv
     where rv.attempt_id = a.id order by rv.decided_at desc limit 1
  ) r on true
  where a.id = p_attempt
    and a.is_fixture                                   -- never a real learner's
    and (public.has_role('admin') or public.is_owner());
$$;

comment on function public.fixture_result(bigint) is
  'Admin preview of a SEEDED result only. The is_fixture condition is not a '
  'convenience — it means this function cannot disclose a real learner''s band '
  'to anybody, so the preview path can never become a back door into results.';

/** Which fixture attempts exist, so the admin page can offer them. */
create or replace function public.fixture_attempts()
returns table (attempt_id bigint, module_id text, scenario text, band text, state text)
language sql stable security definer
set search_path = pg_catalog, public as $$
  select a.id, s.module_id, f.scenario, a.band, a.state
    from public.attempts a
    join public.assessments s on s.id = a.assessment_id
    left join public.test_fixtures f
      on f.table_name = 'attempts' and f.row_key = a.id::text
   where a.is_fixture
     and (public.has_role('admin') or public.is_owner())
   order by f.scenario;
$$;

revoke execute on function public.my_result(text) from public, anon;
grant  execute on function public.my_result(text) to authenticated, service_role;

revoke execute on function public.fixture_result(bigint) from public, anon;
grant  execute on function public.fixture_result(bigint) to authenticated, service_role;

revoke execute on function public.fixture_attempts() from public, anon;
grant  execute on function public.fixture_attempts() to authenticated, service_role;
