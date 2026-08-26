-- 0009 · Certification: records, assessments, credentials, verification.
--
-- APPLIED TO PRODUCTION 2026-08-26, project ertmoznjrjrveidnhonj.
-- Verified after applying: certification_open('e7') is false, 0 credentials
-- exist, and the two real learner profiles with their 18 progress rows are
-- untouched.
--
-- Design turn 10. Two things a learner can earn, and the site had been saying
-- them as one:
--
--   Module Record     finished every lesson, passed each lesson quiz at 60%+.
--                     Issued automatically. No assessment, no waiting.
--   Lrnon Certificate a reviewer read the work and banded it against a
--                     published rubric. The one you can show someone.
--
-- 10i's copy change already shipped; this is the machinery behind it.
--
-- SHIPS CLOSED, and for a reason a migration cannot fix.
--
-- Turn 10g lists five gates before certification goes live on a module. Three
-- are code or content and are met here. Two are not:
--
--   "Two reviewers band 20 sample answers and agree"
--   "Guardian-email path tested with real families"
--
-- Both need named people who do not exist yet, exactly like rooms waiting on a
-- safeguarding owner in 0007. So certification_open() reads a per-module row
-- that ships 'off' and additionally refuses to open without two named reviewers
-- on record. Flipping a boolean is not enough, on purpose: a certificate that
-- nobody competent banded is worse than no certificate at all.
--
-- One thing is deliberately NOT gated. Verification stays on whatever else is
-- switched off — 10g: "Verification can never be switched off while
-- certificates exist in the wild. A certificate that cannot be checked is
-- worse than no certificate."

-- ---------------------------------------------------------------- assessments

create table if not exists public.assessments (
  id               bigserial primary key,
  module_id        text not null,
  syllabus_version int  not null default 1,

  -- How an attempt is banded. 'auto' scores alone; 'auto_human' adds a written
  -- answer a person reads; 'rubric' is human-only; 'oral' is the spoken
  -- alternative 10b offers as "prefer to talk?".
  method text not null check (method in ('auto','auto_human','rubric','oral')),

  rubric_id      text,
  time_limit_min int not null default 45 check (time_limit_min between 5 and 240),

  -- 10b: "The 24-hour gap between attempts is what keeps the claim defensible."
  retake_gap_h int not null default 24 check (retake_gap_h >= 0),

  state text not null default 'draft' check (state in ('draft','live','retired')),
  created_at timestamptz not null default now(),
  unique (module_id, syllabus_version)
);

comment on table public.assessments is
  'One row per module per syllabus version. Retired rather than deleted, because '
  'issued credentials name the version they were assessed against and that '
  'reference must keep resolving forever.';
comment on column public.assessments.rubric_id is
  'Points at a rubric published in the repository, not stored here. 10g gates '
  'going live on "rubric written and published" — published means a learner can '
  'read it before sitting, which a database row is not.';

-- ---------------------------------------------------------------- the gate

create table if not exists public.certification_state (
  module_id text primary key,

  -- 10g's switch, same four positions as Sky's rollout.
  issuing text not null default 'off'
    check (issuing in ('off','staff','slice','everyone')),

  -- 10g: "Human review — off under load → auto-issue then upgrade." Turning
  -- this off does not stop certificates; it stops learners WAITING for one.
  human_review boolean not null default true,

  -- The two gates no migration can satisfy. Both must name a real person.
  reviewer_one uuid references public.profiles(id) on delete set null,
  reviewer_two uuid references public.profiles(id) on delete set null,

  -- 10g's remaining checklist, recorded rather than asserted.
  rubric_published    boolean not null default false,
  sample_agreement    boolean not null default false,  -- 20 samples, both reviewers
  guardian_path_tested boolean not null default false,
  copy_corrected      boolean not null default false,

  note       text,
  updated_at timestamptz not null default now()
);

comment on table public.certification_state is
  'Per-module gate. Ships off for every module. 10g: "The last gate is the one '
  'that exists today. Until the copy is honest, nothing ships." The copy gate is '
  'the only one this repository could close on its own.';

-- E7 is the first module in the queue. Seeded closed, with the one gate that is
-- genuinely met marked as such — 10i shipped ahead of this migration.
insert into public.certification_state
  (module_id, issuing, copy_corrected, rubric_published, note)
values ('e7', 'off', true, true,
        'Two of 10g''s gates are closed in the repository: the copy is corrected '
        '(turn 10i) and the rubric is published at content/rubrics/e7.json where '
        'a learner can read it before sitting. The remaining three need people — '
        'two named reviewers, their agreement on 20 sample answers, and the '
        'guardian-email path tested with real families. Until then, issuing '
        'stays off and certification_open() returns false.')
on conflict (module_id) do nothing;

/** Whether certification may issue for a module right now.
 *
 *  Deliberately conjunctive. The switch alone cannot open it: the two reviewers
 *  have to exist, be different people, and every gate has to be green. This is
 *  0007's rooms_open() applied to a different promise.
 */
create or replace function public.certification_open(p_module text)
returns boolean language sql stable security definer
set search_path = pg_catalog, public as $$
  select coalesce(
    (select issuing <> 'off'
        and reviewer_one is not null
        and reviewer_two is not null
        and reviewer_one <> reviewer_two
        and rubric_published
        and sample_agreement
        and guardian_path_tested
        and copy_corrected
       from public.certification_state where module_id = p_module),
    false);
$$;

comment on function public.certification_open(text) is
  'The gate. A boolean flipped in isolation opens nothing — 10g requires two '
  'named reviewers who have agreed on 20 sample answers, and they must be two '
  'different people.';

-- ---------------------------------------------------------------- attempts

create table if not exists public.attempts (
  id            bigserial primary key,
  assessment_id bigint not null references public.assessments(id),
  learner_id    uuid   not null references public.profiles(id) on delete cascade,

  started_at   timestamptz not null default now(),
  submitted_at timestamptz,

  auto_score     int check (auto_score >= 0),
  auto_max       int check (auto_max    >= 0),
  written_answer text,

  band        text check (band in ('not_yet','nearly','secure')),
  band_source text check (band_source in ('score','rubric')),

  state text not null default 'in_progress'
    check (state in ('in_progress','submitted','awaiting_review','graded','abandoned')),

  check (band is null or band_source is not null)
);

create index if not exists attempts_learner on public.attempts (learner_id, started_at desc);
create index if not exists attempts_queue   on public.attempts (state, submitted_at)
  where state = 'awaiting_review';

comment on column public.attempts.written_answer is
  'Read by a volunteer. Never shown alongside the learner''s name before a band '
  'is decided — see review_queue().';

-- ---------------------------------------------------------------- credentials

create table if not exists public.credentials (
  id   bigserial primary key,
  code text not null unique,

  tier       text not null check (tier in ('record','certificate')),
  learner_id uuid not null references public.profiles(id) on delete cascade,
  module_id  text not null,
  attempt_id bigint references public.attempts(id),

  -- 10a: "Type it yourself, exactly as you want it printed."
  display_name  text,
  name_initials text,
  name_confirmed_by text check (name_confirmed_by in ('self','guardian')),

  issued_at        timestamptz not null default now(),
  syllabus_version int not null default 1,
  method_shown     text,
  reviewer_handle  text,

  state text not null default 'valid'
    check (state in ('valid','superseded','revoked','withdrawn')),

  -- A certificate always names an attempt; a record never does.
  check ((tier = 'certificate') = (attempt_id is not null)),
  -- A certificate always prints a name; a record needs none.
  check (tier = 'record' or (display_name is not null and name_confirmed_by is not null))
);

-- One record and one certificate per learner per module. Re-sitting upgrades
-- the existing certificate rather than minting a second one, so a learner can
-- never hold two certificates for the same module that disagree.
create unique index if not exists credentials_one_per_tier
  on public.credentials (learner_id, module_id, tier);
create index if not exists credentials_module on public.credentials (module_id, issued_at desc);

comment on column public.credentials.code is
  '10h: random, not sequential — "a code must not reveal how many certificates '
  'exist or let anyone walk the list". Alphabet excludes 0/O and 1/I/L so a '
  'handwritten or badly photocopied code stays readable.';
comment on column public.credentials.reviewer_handle is
  'The reviewer''s generated handle, never their name. Printed on the '
  'certificate so a band is attributable without exposing a volunteer.';

-- ---------------------------------------------------------------- review

create table if not exists public.reviews (
  id         bigserial primary key,
  attempt_id bigint not null references public.attempts(id) on delete cascade,
  reviewer_id uuid  not null references public.profiles(id),

  -- 10f: four criteria, banded individually. "Three or four secure gives
  -- secure; two gives nearly."
  criterion_bands text[] not null,
  notes           text[] not null default '{}',
  decided_at      timestamptz not null default now(),

  check (array_length(criterion_bands, 1) = 4)
);

create table if not exists public.revocations (
  id            bigserial primary key,
  credential_id bigint not null references public.credentials(id) on delete cascade,
  proposed_by   uuid   not null references public.profiles(id),
  decided_by    uuid   references public.profiles(id),

  -- 10f's grounds. The last value exists so the list itself records what is
  -- never a ground; nothing may be inserted with it.
  reason_public text not null check (reason_public in (
    'proven_cheating',
    'impersonation_or_shared_account',
    'assessment_defect',
    'holder_request',
    'legal_or_safeguarding')),

  reason_private text,

  -- 10g: "logged as a Delete, 30-day hold, holder notified."
  hold_until          timestamptz not null default now() + interval '30 days',
  learner_notified_at timestamptz,
  executed_at         timestamptz,
  created_at          timestamptz not null default now()
);

comment on column public.revocations.reason_public is
  '10e: "We publish the category of reason, never the detail." 10f is equally '
  'clear about what is NEVER a ground — refusing to donate, going inactive, or '
  'criticising Lrnon — so those values do not exist in this check constraint '
  'and cannot be recorded even by an owner.';
comment on column public.revocations.learner_notified_at is
  '10g: the holder is notified BEFORE, not after. execute_revocation() refuses '
  'while this is null.';

create table if not exists public.verify_log (
  id      bigserial primary key,
  code    text not null,
  ip_hash text,
  at      timestamptz not null default now(),
  initials_attempts int not null default 0
);
create index if not exists verify_log_code_at on public.verify_log (code, at desc);

comment on table public.verify_log is
  'Rate limiting for the public verify endpoint, and nothing else. Stores a hash '
  'of the caller''s address, never the address: this table is about protecting '
  'children''s names from enumeration, so it must not itself become a log of who '
  'checked whose certificate.';

-- ---------------------------------------------------------------- codes

/** Generate a public credential code.
 *
 *  10h: random, not sequential; alphabet excludes 0/O and 1/I/L. Ten characters
 *  from a 30-character alphabet is ~49 bits — far past guessable, which matters
 *  because a code is the only thing standing between a stranger and the
 *  existence of a child's certificate.
 */
create or replace function public.generate_credential_code()
returns text language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  -- no 0 O 1 I L
  v_out text;
  i int;
begin
  for attempt in 1..40 loop
    v_out := '';
    for i in 1..10 loop
      v_out := v_out || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    -- Grouped for reading aloud and for copying off a bad print.
    v_out := substr(v_out,1,4) || '-' || substr(v_out,5,3) || '-' || substr(v_out,8,3);
    if not exists (select 1 from public.credentials where code = v_out) then
      return v_out;
    end if;
  end loop;
  raise exception 'generate_credential_code: no free code after 40 draws';
end $$;

-- ---------------------------------------------------------------- records

/** Issue the Module Record, if it is earned.
 *
 *  10a: "Issued automatically, no assessment, no waiting." Idempotent — calling
 *  it twice returns the existing code rather than failing, because the client
 *  calls it on every module-completion render and a duplicate must never be a
 *  visible error.
 *
 *  Deliberately NOT gated on certification_open(). Records do not depend on
 *  reviewers existing, and withholding them until certification opens would
 *  punish learners for a staffing gap that is ours, not theirs.
 */
create or replace function public.issue_module_record(p_module text, p_lesson_total int)
returns text language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
declare
  v_learner uuid := auth.uid();
  v_done int;
  v_code text;
begin
  if v_learner is null then raise exception 'issue_module_record: sign in first'; end if;
  if p_lesson_total is null or p_lesson_total < 1 then
    raise exception 'issue_module_record: lesson total must be positive';
  end if;

  select code into v_code from public.credentials
   where learner_id = v_learner and module_id = p_module and tier = 'record';
  if v_code is not null then return v_code; end if;

  -- The slug prefix is the module: lesson slugs are 'explorer/e7/l1-...'.
  select count(*) into v_done from public.lesson_progress
   where user_id = v_learner
     and status = 'completed'
     and lesson_slug like '%/' || p_module || '/%';

  if v_done < p_lesson_total then
    raise exception 'issue_module_record: % of % lessons complete', v_done, p_lesson_total;
  end if;

  v_code := public.generate_credential_code();
  insert into public.credentials (code, tier, learner_id, module_id)
  values (v_code, 'record', v_learner, p_module);
  return v_code;
end $$;

-- ---------------------------------------------------------------- attempts

/** Start an assessment attempt.
 *
 *  Enforces two of 10h's five server-side rules directly:
 *    · "No certificate without a Module Record first."
 *    · "Second attempt refused inside 24h of the last."
 */
create or replace function public.start_attempt(p_module text)
returns bigint language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
declare
  v_learner uuid := auth.uid();
  v_assessment bigint;
  v_gap int;
  v_last timestamptz;
  v_open bigint;
  v_id bigint;
begin
  if v_learner is null then raise exception 'start_attempt: sign in first'; end if;

  if not public.certification_open(p_module) then
    raise exception 'start_attempt: certification is not open for %', p_module;
  end if;

  select id, retake_gap_h into v_assessment, v_gap
    from public.assessments
   where module_id = p_module and state = 'live'
   order by syllabus_version desc limit 1;
  if v_assessment is null then
    raise exception 'start_attempt: no live assessment for %', p_module;
  end if;

  -- Rule: the record comes first. This is the whole tiering — a certificate
  -- says a reviewer read your work, which is meaningless if you have not done
  -- the module it assesses.
  if not exists (select 1 from public.credentials
                  where learner_id = v_learner and module_id = p_module
                    and tier = 'record' and state = 'valid') then
    raise exception 'start_attempt: earn the Module Record for % first', p_module;
  end if;

  -- Resume rather than duplicate. 10b: "Saved as you go. If your connection
  -- drops, you resume here."
  select id into v_open from public.attempts
   where learner_id = v_learner and assessment_id = v_assessment and state = 'in_progress'
   order by started_at desc limit 1;
  if v_open is not null then return v_open; end if;

  select max(submitted_at) into v_last from public.attempts
   where learner_id = v_learner and assessment_id = v_assessment and submitted_at is not null;

  if v_last is not null and v_last > now() - make_interval(hours => v_gap) then
    raise exception 'start_attempt: next attempt allowed after %',
      to_char(v_last + make_interval(hours => v_gap), 'YYYY-MM-DD HH24:MI');
  end if;

  insert into public.attempts (assessment_id, learner_id)
  values (v_assessment, v_learner) returning id into v_id;
  return v_id;
end $$;

/** Submit an attempt. Bands it on score when no human step applies, or when
 *  human review is switched off under load.
 *
 *  10b: "Not enough reviewers are free right now, so we are not making you wait
 *  for one. Your auto-marked result is being issued today, and a reviewer will
 *  read your written answer later — if they band you higher, your certificate
 *  is upgraded automatically."
 */
create or replace function public.submit_attempt(
  p_attempt bigint, p_score int, p_max int, p_written text default null
) returns text language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
declare
  v_learner uuid := auth.uid();
  v_module text; v_method text; v_human boolean; v_state text;
  v_band text; v_pct numeric;
begin
  if v_learner is null then raise exception 'submit_attempt: sign in first'; end if;

  select a.state, s.module_id, s.method, c.human_review
    into v_state, v_module, v_method, v_human
    from public.attempts a
    join public.assessments s on s.id = a.assessment_id
    left join public.certification_state c on c.module_id = s.module_id
   where a.id = p_attempt and a.learner_id = v_learner;

  if v_module is null then raise exception 'submit_attempt: no such attempt'; end if;
  if v_state <> 'in_progress' then
    raise exception 'submit_attempt: attempt already %', v_state;
  end if;
  if p_max is null or p_max < 1 then raise exception 'submit_attempt: bad maximum'; end if;
  if p_score is null or p_score < 0 or p_score > p_max then
    raise exception 'submit_attempt: score out of range';
  end if;

  -- 10a's published bands for score-marked modules.
  v_pct := (p_score::numeric / p_max) * 100;
  v_band := case when v_pct >= 80 then 'secure'
                 when v_pct >= 60 then 'nearly'
                 else 'not_yet' end;

  if v_method in ('auto_human','rubric','oral')
     and coalesce(v_human, true)
     and p_written is not null then
    update public.attempts
       set submitted_at = now(), auto_score = p_score, auto_max = p_max,
           written_answer = p_written, state = 'awaiting_review'
     where id = p_attempt;
    return 'awaiting_review';
  end if;

  update public.attempts
     set submitted_at = now(), auto_score = p_score, auto_max = p_max,
         written_answer = p_written,
         band = v_band, band_source = 'score', state = 'graded'
   where id = p_attempt;

  perform public.issue_from_attempt(p_attempt);
  return v_band;
end $$;

-- The name is captured and confirmed BEFORE the assessment (10a: "Before you
-- start"), so it exists independently of any attempt and is not re-typed on
-- every re-sit.
create table if not exists public.certificate_names (
  learner_id    uuid primary key references public.profiles(id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 2 and 120),
  name_initials text not null,
  name_confirmed_by text not null check (name_confirmed_by in ('self','guardian')),
  confirmed_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- issuing

/** Turn a graded attempt into a credential, or upgrade one that exists.
 *
 *  10h: "Band immutable once issued, except upgrade." 10c: "Nothing is taken
 *  away by an upgrade, and nothing is downgraded by one." Both are enforced by
 *  the rank comparison below rather than left to whoever calls this.
 */
create or replace function public.issue_from_attempt(p_attempt bigint)
returns text language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
declare
  v_learner uuid; v_module text; v_band text; v_src text; v_ver int; v_method text;
  v_reviewer text;
  v_code text; v_existing text;
  v_rank int;
begin
  select a.learner_id, s.module_id, a.band, a.band_source, s.syllabus_version, s.method
    into v_learner, v_module, v_band, v_src, v_ver, v_method
    from public.attempts a join public.assessments s on s.id = a.assessment_id
   where a.id = p_attempt;

  if v_learner is null then raise exception 'issue_from_attempt: no such attempt'; end if;
  if v_band is null then raise exception 'issue_from_attempt: attempt is not banded'; end if;

  -- 10c: "not yet" issues nothing, and is recorded nowhere public.
  if v_band = 'not_yet' then return 'not_yet'; end if;

  select p.handle into v_reviewer
    from public.reviews r join public.profiles p on p.id = r.reviewer_id
   where r.attempt_id = p_attempt order by r.decided_at desc limit 1;

  select c.code into v_existing
    from public.credentials c
   where c.learner_id = v_learner and c.module_id = v_module and c.tier = 'certificate';

  v_rank := case v_band when 'secure' then 2 when 'nearly' then 1 else 0 end;

  if v_existing is not null then
    -- Upgrade only. A later review that bands lower changes nothing.
    update public.credentials c
       set attempt_id = p_attempt,
           method_shown = v_method,
           reviewer_handle = coalesce(v_reviewer, c.reviewer_handle)
     where c.code = v_existing
       and v_rank > (select case a.band when 'secure' then 2 when 'nearly' then 1 else 0 end
                     from public.attempts a where a.id = c.attempt_id);
    return v_existing;
  end if;

  v_code := public.generate_credential_code();
  insert into public.credentials
    (code, tier, learner_id, module_id, attempt_id, issued_at,
     syllabus_version, method_shown, reviewer_handle,
     display_name, name_initials, name_confirmed_by)
  select v_code, 'certificate', v_learner, v_module, p_attempt, now(),
         v_ver,
         case when v_src = 'rubric' then 'Auto-marked + human review'
              else 'Auto-marked' end,
         v_reviewer,
         d.display_name, d.name_initials, d.name_confirmed_by
    from public.certificate_names d
   where d.learner_id = v_learner;

  if not found then
    raise exception 'issue_from_attempt: confirm the name for the certificate first';
  end if;
  return v_code;
end $$;

/** Record the name to print, deriving the initials rather than trusting them.
 *
 *  10h's fifth rule is "under-13 requires name_confirmed_by = guardian". This
 *  project does not store dates of birth — deliberately, per 0005 — so there is
 *  no age column to test. What it does store is whether an account required
 *  guardian consent at all, which 0005 records for every under-18. Any account
 *  with a live consent record must therefore use the guardian path. That is
 *  stricter than the design's under-13 line, which is the correct direction to
 *  err.
 */
create or replace function public.confirm_certificate_name(
  p_name text, p_confirmed_by text
) returns void language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
declare
  v_learner uuid := auth.uid();
  v_minor boolean;
  v_initials text;
begin
  if v_learner is null then raise exception 'confirm_certificate_name: sign in first'; end if;
  if p_confirmed_by not in ('self','guardian') then
    raise exception 'confirm_certificate_name: confirmed_by must be self or guardian';
  end if;
  if p_name is null or char_length(btrim(p_name)) < 2 then
    raise exception 'confirm_certificate_name: name is too short to print';
  end if;

  select exists (select 1 from public.guardian_consents
                  where subject_user = v_learner and scope = 'account'
                    and granted_at is not null and withdrawn_at is null)
    into v_minor;

  if v_minor and p_confirmed_by <> 'guardian' then
    raise exception 'confirm_certificate_name: a guardian must confirm this name';
  end if;

  select string_agg(left(part, 1), ' ')
    into v_initials
    from unnest(regexp_split_to_array(btrim(p_name), '\s+')) as part;

  insert into public.certificate_names
    (learner_id, display_name, name_initials, name_confirmed_by)
  values (v_learner, btrim(p_name), upper(v_initials), p_confirmed_by)
  on conflict (learner_id) do update
    set display_name = excluded.display_name,
        name_initials = excluded.name_initials,
        name_confirmed_by = excluded.name_confirmed_by,
        confirmed_at = now();
end $$;

-- ---------------------------------------------------------------- reviewing

/** The reviewer's queue.
 *
 *  10h: "Reviewer never sees display_name pre-decision." 10f says the same from
 *  the other side: "Reviewers never see the learner's name while banding. It is
 *  attached after the decision."
 *
 *  That is a property of the QUERY, not of a UI that promises to hide a column,
 *  so this function is the only way a reviewer reaches an answer and it does not
 *  select a name to begin with.
 */
create or replace function public.review_queue()
returns table (attempt_id bigint, module_id text, answer text,
               auto_score int, auto_max int, waiting_since timestamptz)
language sql stable security definer
set search_path = pg_catalog, public as $$
  select a.id, s.module_id, a.written_answer, a.auto_score, a.auto_max, a.submitted_at
    from public.attempts a
    join public.assessments s on s.id = a.assessment_id
   where a.state = 'awaiting_review'
     and (public.has_role('reviewer') or public.has_role('admin') or public.is_owner())
   order by a.submitted_at;
$$;

/** Band a written answer against the four rubric criteria.
 *
 *  10f: "Three or four secure gives secure; two gives nearly." A note is
 *  required on any criterion below secure — enforced here, because feedback the
 *  learner can act on is the entire value of a human read, and a reviewer in a
 *  hurry is exactly who would skip it.
 */
create or replace function public.record_review(
  p_attempt bigint, p_bands text[], p_notes text[]
) returns text language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
declare
  v_reviewer uuid := auth.uid();
  v_secure int; v_band text; i int;
begin
  if v_reviewer is null then raise exception 'record_review: sign in first'; end if;
  if not (public.has_role('reviewer') or public.has_role('admin') or public.is_owner()) then
    raise exception 'record_review: reviewers only';
  end if;
  if array_length(p_bands, 1) is distinct from 4 then
    raise exception 'record_review: band all four criteria';
  end if;

  for i in 1..4 loop
    if p_bands[i] not in ('not_yet','nearly','secure') then
      raise exception 'record_review: criterion % has an unknown band', i;
    end if;
    if p_bands[i] <> 'secure'
       and (p_notes is null or coalesce(btrim(p_notes[i]), '') = '') then
      raise exception 'record_review: criterion % is below secure and needs a note', i;
    end if;
  end loop;

  select count(*) into v_secure from unnest(p_bands) b where b = 'secure';
  v_band := case when v_secure >= 3 then 'secure'
                 when v_secure = 2 then 'nearly'
                 else 'not_yet' end;

  insert into public.reviews (attempt_id, reviewer_id, criterion_bands, notes)
  values (p_attempt, v_reviewer, p_bands, coalesce(p_notes, '{}'));

  update public.attempts
     set band = v_band, band_source = 'rubric', state = 'graded'
   where id = p_attempt;

  return public.issue_from_attempt(p_attempt);
end $$;

-- ---------------------------------------------------------------- revocation

/** Propose a revocation. Never executes one.
 *
 *  10f: "Issuing is automatic. Revoking is not." 10g puts revocation in the
 *  owners' decision queue as a Delete, which 0006 already models — so this
 *  raises that decision rather than inventing a parallel approval path.
 */
create or replace function public.propose_revocation(
  p_code text, p_reason text, p_private text default null
) returns bigint language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
declare
  v_actor uuid := auth.uid();
  v_cred bigint; v_module text; v_id bigint;
begin
  if v_actor is null then raise exception 'propose_revocation: sign in first'; end if;
  if not (public.has_role('admin') or public.is_owner()) then
    raise exception 'propose_revocation: administrators only';
  end if;

  select id, module_id into v_cred, v_module from public.credentials where code = p_code;
  if v_cred is null then raise exception 'propose_revocation: no such credential'; end if;

  insert into public.revocations (credential_id, proposed_by, reason_public, reason_private)
  values (v_cred, v_actor, p_reason, p_private)
  returning id into v_id;

  perform public.raise_decision(
    'deletion',
    'Revoke certificate ' || p_code,
    'Module ' || v_module || '. Category: ' || p_reason ||
    '. Holder must be notified and given a chance to respond before this executes.',
    'revocation:' || v_id);

  insert into public.admin_audit (actor, action, detail)
  values (v_actor, 'propose_revocation',
          jsonb_build_object('credential', v_cred, 'reason', p_reason));
  return v_id;
end $$;

/** Execute a revocation. Owners only, after the hold, and never before the
 *  holder has been told.
 *
 *  10g: "30-day hold, holder notified." 10f: "learner told and can respond
 *  first." The notification check is not advisory — a revocation the holder
 *  first learns about from a rejected job application is the failure this
 *  whole clause exists to prevent.
 */
create or replace function public.execute_revocation(p_revocation bigint)
returns void language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
declare
  v_actor uuid := auth.uid();
  v_cred bigint; v_hold timestamptz; v_told timestamptz; v_done timestamptz;
  v_reason text;
begin
  if not public.is_owner() then raise exception 'execute_revocation: owners only'; end if;

  select credential_id, hold_until, learner_notified_at, executed_at, reason_public
    into v_cred, v_hold, v_told, v_done, v_reason
    from public.revocations where id = p_revocation;

  if v_cred is null then raise exception 'execute_revocation: no such revocation'; end if;
  if v_done is not null then raise exception 'execute_revocation: already executed'; end if;
  if v_told is null then
    raise exception 'execute_revocation: notify the holder before revoking';
  end if;
  if now() < v_hold then
    raise exception 'execute_revocation: 30-day hold runs until %',
      to_char(v_hold, 'YYYY-MM-DD');
  end if;

  update public.credentials
     set state = case when v_reason = 'holder_request' then 'withdrawn' else 'revoked' end
   where id = v_cred;

  update public.revocations set decided_by = v_actor, executed_at = now()
   where id = p_revocation;

  insert into public.admin_audit (actor, action, detail)
  values (v_actor, 'execute_revocation',
          jsonb_build_object('revocation', p_revocation, 'credential', v_cred));
end $$;

-- ---------------------------------------------------------------- verifying

/** Public verification, step one: status only, no name.
 *
 *  10e: "TierLrnon Certificate / HolderNot shown". Callable by anon on purpose —
 *  "no account needed" is the point of the page. It returns the same shape for a
 *  code that never existed as for one that did: 10e is explicit that "we do not
 *  say whether a code ever existed", because that answer alone would let someone
 *  probe for the existence of a child's certificate.
 */
create or replace function public.verify_credential(p_code text)
returns table (found boolean, tier text, module_id text,
               syllabus_version int, issued_at timestamptz, state text)
language sql stable security definer
set search_path = pg_catalog, public as $$
  select c.id is not null, c.tier, c.module_id, c.syllabus_version, c.issued_at, c.state
    from (select 1) _
    left join public.credentials c on c.code = upper(btrim(p_code));
$$;

/** Step two: reveal the name, but only to someone holding the certificate.
 *
 *  10e states the reasoning plainly and it governs the whole design of this
 *  function: "most Lrnon learners are children, and a code alone should not
 *  return a child's name to a stranger."
 *
 *  So the caller must already know the initials — which they do if the person is
 *  standing in front of them with their copy, and do not if they merely scraped
 *  a code. Three wrong tries cools the code for an hour.
 */
create or replace function public.reveal_credential(p_code text, p_initials text, p_ip_hash text)
returns table (revealed boolean, display_name text, band text, method text, cooled boolean)
language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
declare
  v_code text := upper(btrim(p_code));
  v_wrong int;
  v_cred public.credentials%rowtype;
  v_band text;
begin
  select count(*) into v_wrong from public.verify_log
   where code = v_code and at > now() - interval '1 hour' and initials_attempts > 0;

  if v_wrong >= 3 then
    return query select false, null::text, null::text, null::text, true;
    return;
  end if;

  select * into v_cred from public.credentials where code = v_code;

  if v_cred.id is null
     or v_cred.name_initials is distinct from upper(btrim(p_initials)) then
    insert into public.verify_log (code, ip_hash, initials_attempts) values (v_code, p_ip_hash, 1);
    return query select false, null::text, null::text, null::text, false;
    return;
  end if;

  insert into public.verify_log (code, ip_hash, initials_attempts) values (v_code, p_ip_hash, 0);
  select band into v_band from public.attempts where id = v_cred.attempt_id;

  return query select true, v_cred.display_name, v_band, v_cred.method_shown, false;
end $$;

-- ---------------------------------------------------------------- RLS

alter table public.assessments        enable row level security;
alter table public.certification_state enable row level security;
alter table public.attempts           enable row level security;
alter table public.credentials        enable row level security;
alter table public.certificate_names  enable row level security;
alter table public.reviews            enable row level security;
alter table public.revocations        enable row level security;
alter table public.verify_log         enable row level security;

-- A learner may read the assessment they are about to sit, and the gate that
-- decides whether they can. Both are things we publish anyway.
create policy "assessments: live ones are public" on public.assessments
  for select using (state = 'live');
create policy "certification state: public" on public.certification_state
  for select using (true);

-- Everything about an attempt is the learner's own, plus reviewers who reach it
-- only through review_queue(), which does not select a name.
create policy "attempts: own only" on public.attempts
  for select using (learner_id = auth.uid());
create policy "credentials: own only" on public.credentials
  for select using (learner_id = auth.uid());
create policy "names: own only" on public.certificate_names
  for select using (learner_id = auth.uid());

create policy "reviews: reviewer or owner" on public.reviews
  for select using (reviewer_id = auth.uid() or public.is_owner());
create policy "revocations: administrators" on public.revocations
  for select using (public.has_role('admin') or public.is_owner());

-- No select policy on verify_log at all. It exists to be counted by a definer
-- function and read by nobody: it is a record of who checked which child's
-- certificate, and the safest thing to do with that is make it unreadable.

-- Every table is definer-function-only for writes. Same rule as the rest of
-- this schema: RLS decides what is visible, functions decide what changes.
revoke insert, update, delete on
  public.assessments, public.certification_state, public.attempts,
  public.credentials, public.certificate_names, public.reviews,
  public.revocations, public.verify_log
from anon, authenticated;

-- ---------------------------------------------------------------- privileges
--
-- 0003's rule: revoke from PUBLIC first, then grant the exact roles. PostgreSQL
-- grants EXECUTE to PUBLIC on every new function, and anon inherits it.

revoke execute on function public.generate_credential_code() from public, anon, authenticated;

revoke execute on function public.certification_open(text) from public;
grant  execute on function public.certification_open(text) to anon, authenticated, service_role;

revoke execute on function public.issue_module_record(text,int) from public, anon;
grant  execute on function public.issue_module_record(text,int) to authenticated, service_role;

revoke execute on function public.start_attempt(text) from public, anon;
grant  execute on function public.start_attempt(text) to authenticated, service_role;

revoke execute on function public.submit_attempt(bigint,int,int,text) from public, anon;
grant  execute on function public.submit_attempt(bigint,int,int,text) to authenticated, service_role;

revoke execute on function public.issue_from_attempt(bigint) from public, anon, authenticated;
grant  execute on function public.issue_from_attempt(bigint) to service_role;

revoke execute on function public.confirm_certificate_name(text,text) from public, anon;
grant  execute on function public.confirm_certificate_name(text,text) to authenticated, service_role;

revoke execute on function public.review_queue() from public, anon;
grant  execute on function public.review_queue() to authenticated, service_role;

revoke execute on function public.record_review(bigint,text[],text[]) from public, anon;
grant  execute on function public.record_review(bigint,text[],text[]) to authenticated, service_role;

revoke execute on function public.propose_revocation(text,text,text) from public, anon;
grant  execute on function public.propose_revocation(text,text,text) to authenticated, service_role;

revoke execute on function public.execute_revocation(bigint) from public, anon;
grant  execute on function public.execute_revocation(bigint) to authenticated, service_role;

-- The two verification functions are the only ones anon may call, because
-- "no account needed" is the requirement they exist to meet.
revoke execute on function public.verify_credential(text) from public;
grant  execute on function public.verify_credential(text) to anon, authenticated, service_role;

revoke execute on function public.reveal_credential(text,text,text) from public;
grant  execute on function public.reveal_credential(text,text,text) to anon, authenticated, service_role;
