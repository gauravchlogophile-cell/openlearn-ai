-- 0014 · Make the four Sky gates measurable instead of asserted.
--
-- /admin/sky has shown four readiness gates since it was built:
--
--     200 staff questions reviewed by hand     0
--     No answer without a source               enforced in code
--     Wrong-answer rate under 2%               not measured
--     Refusal wording signed off by a teacher  pending
--
-- Three of those four were a hard-coded array in AdminSky.tsx. They could not
-- become true. Nothing anybody did would change them, and the console would
-- have gone on reporting "0" and "not measured" through any amount of actual
-- review — which makes the gate a decoration on the page rather than a control
-- on the decision it exists to govern.
--
-- P3·L7, published the same week, argues that a claim you have not measured is
-- a claim you are guessing about. This file is that argument applied to our own
-- console.
--
-- What is deliberately NOT here: a log of learner questions. P3·L8 says a
-- record of what people asked an assistant is a record of what they were
-- worried about, and on this site that includes children. Reviews are written
-- by staff about their own questions, and the question text is nullable and
-- supplied explicitly — never captured by the route.

create table if not exists public.sky_review (
  id        bigserial primary key,
  at        timestamptz not null default now(),
  reviewer  uuid references public.profiles(id) on delete set null,

  /* Four verdicts, not three. "Refused" splits into two opposite things:
     declining a question genuinely outside the material is the assistant
     working, and declining one it should have answered is a failure. Collapsing
     them would let a rise in wrong refusals read as improving safety. */
  verdict   text not null check (verdict in
              ('good', 'wrong', 'refused_rightly', 'refused_wrongly')),

  /* Lesson slugs the answer cited. Provenance, per P3·L8 — this is what turns
     "an answer was wrong" into "this passage caused it". Slugs, never passage
     text: the lessons are public and the index can be rebuilt from them. */
  sources   text[] not null default '{}',

  /* Both optional, both written by the reviewer, neither captured automatically.
     A staff member reviewing their own question may record it when it helps a
     later reader; nothing on the request path ever populates this. */
  question  text check (question is null or char_length(question) <= 500),
  note      text check (note is null or char_length(note) <= 2000)
);

comment on table public.sky_review is
  'Hand review of Sky answers by staff. Feeds the readiness gates in '
  '/admin/sky. Question text is optional and reviewer-supplied; the route '
  'never writes it.';

create index if not exists sky_review_at on public.sky_review (at desc);

alter table public.sky_review enable row level security;

/* Readable by staff, and by nobody else. There is no learner-facing view of
   this and there should not be one. is_owner() is included explicitly because
   0012 established that has_role('admin') is false for the owner — the same
   omission locked the owner out of four policies before it was noticed. */
drop policy if exists sky_review_read on public.sky_review;
create policy sky_review_read on public.sky_review
  for select to authenticated
  using (public.has_role('admin') or public.is_owner());

/* No direct writes. The definer function below is the only path, so the
   reviewer column cannot be forged and the verdict cannot bypass its check. */
revoke insert, update, delete on public.sky_review from anon, authenticated;

-- ---------------------------------------------------------------- recording

create or replace function public.record_sky_review(
  p_verdict  text,
  p_sources  text[] default '{}',
  p_question text default null,
  p_note     text default null)
returns bigint
language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
declare v_id bigint;
begin
  if not (public.has_role('admin') or public.is_owner()) then
    raise exception 'only staff may review Sky answers';
  end if;

  insert into public.sky_review (reviewer, verdict, sources, question, note)
  values (auth.uid(), p_verdict, coalesce(p_sources, '{}'), p_question, p_note)
  returning id into v_id;

  return v_id;
end $$;

-- ------------------------------------------------------------------- gates

/* One row, so the console cannot show three numbers from three moments.
   Everything the gates need, computed where the data is. */
create or replace function public.sky_gate_stats()
returns table (
  reviewed          bigint,
  wrong             bigint,
  refused_wrongly   bigint,
  wrong_rate        numeric,
  reviewers         bigint,
  first_review      timestamptz,
  last_review       timestamptz,
  refusal_signed_off boolean,
  signed_off_at     timestamptz)
language sql stable security definer
set search_path = pg_catalog, public as $$
  select
    count(*)::bigint,
    count(*) filter (where verdict = 'wrong')::bigint,
    count(*) filter (where verdict = 'refused_wrongly')::bigint,
    /* Null rather than zero on an empty table. A rate of 0% from no reviews
       reads as "nothing is wrong" when it means "nothing is known", and that
       is the exact confusion these gates exist to prevent. */
    case when count(*) = 0 then null
         else round(count(*) filter (where verdict = 'wrong')::numeric
                    / count(*)::numeric, 4) end,
    count(distinct reviewer)::bigint,
    min(at), max(at),
    /* Gate four lives in the decision queue rather than in a table of its own.
       A sign-off IS a decision: it has someone who raised it, someone who
       approved it, and a date. Inventing a second place to record approvals
       would have meant two records of the same kind of fact. */
    exists (select 1 from public.decisions d
             where d.ref = 'sky:refusal-wording'
               and d.outcome = 'approved'),
    (select max(d.decided_at) from public.decisions d
      where d.ref = 'sky:refusal-wording' and d.outcome = 'approved')
  from public.sky_review;
$$;

comment on function public.sky_gate_stats() is
  'Everything the /admin/sky readiness gates need, in one row so the console '
  'cannot report three numbers from three different moments.';

-- ------------------------------------------------------------------ grants
--
-- The pattern from 0003: revoke from PUBLIC first. Revoking from anon and
-- authenticated alone leaves the PUBLIC grant in place, and PUBLIC includes
-- both, so the function stays callable by exactly the roles you thought you
-- had removed.

revoke execute on function
  public.record_sky_review(text, text[], text, text) from public, anon;
grant execute on function
  public.record_sky_review(text, text[], text, text) to authenticated;

revoke execute on function public.sky_gate_stats() from public, anon;
grant  execute on function public.sky_gate_stats() to authenticated;
