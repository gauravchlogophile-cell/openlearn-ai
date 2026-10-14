-- 0016 · Name the failures, over a window long enough to find them in.
--
-- On 2026-09-09 one Sky call failed and nobody saw it for five weeks:
--
--   400 — "User location is not supported for the API use.
--          [FAILED_PRECONDITION]"
--
-- Two gaps let that happen, and both are in sky_spend_summary. It counts
-- failures and names none of them, so the console showed "failed: 1" and
-- nothing else. And its window is seven days, so by the time anyone looked the
-- single most interesting thing Sky had ever done had scrolled out of
-- existence. A number that disappears is not detection.
--
-- P3·L8 asks "what would I notice?" and says the uncomfortable version is: if
-- this had happened last Tuesday, would I know today? The honest answer here
-- was no, from a console built specifically to answer yes.
--
-- 180 days, grouped by reason, newest first. Reasons are our own words about a
-- status code; the question is never recorded, so this stays within L8's rule
-- about logging the shape of a failure rather than its content.

create or replace function public.sky_failures()
returns table (
  reason      text,
  occurrences bigint,
  first_seen  timestamptz,
  last_seen   timestamptz,
  model       text)
language sql stable security definer
set search_path = pg_catalog, public as $$
  select left(s.fail_reason, 300),
         count(*)::bigint,
         min(s.reserved_at),
         max(s.reserved_at),
         max(s.model)
    from public.sky_spend s
   where (public.is_owner() or public.has_role('admin'))
     and s.ok is false
     and s.fail_reason is not null
     and s.reserved_at > now() - interval '180 days'
   group by left(s.fail_reason, 300)
   order by max(s.reserved_at) desc
   limit 20;
$$;

comment on function public.sky_failures() is
  'Distinct provider failure reasons over 180 days, newest first. '
  'sky_spend_summary counts failures over 7 days and names none of them, so a '
  'single failure went unseen for five weeks and then fell out of the window. '
  'Reasons are our own words about a status code — never a learner question.';

revoke execute on function public.sky_failures() from public, anon;
grant  execute on function public.sky_failures() to authenticated;
