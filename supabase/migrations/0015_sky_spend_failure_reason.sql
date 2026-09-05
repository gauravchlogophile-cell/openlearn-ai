-- 0015 · Record WHY a provider call failed, in the row that already records
-- that it failed.
--
-- Three runs of the injection corpus lost the same ten cases to "error:
-- provider" with no reason attached. The route returns a reason. The console
-- prints it. The deployed bundle was fetched from lrnon.org and verified to
-- contain that code. The reason still never arrived.
--
-- Every round of that diagnosis depended on a person relaying what a table
-- showed, and it has now been lossy three times. sky_spend already records
-- that a call failed; recording the reason beside it makes the failure
-- readable at the database — no browser, no relay, and no live log stream that
-- has to be watched at the moment it happens.
--
-- P3·L8's rule is followed rather than bent: this logs the SHAPE of a failure,
-- never a learner's question. A provider status code and our own words about
-- it are operational facts about our own request. They are not a record of
-- what anybody asked.

alter table public.sky_spend
  add column if not exists fail_reason text;

comment on column public.sky_spend.fail_reason is
  'Why the provider call failed, when it did. Our own words about a status '
  'code — never the provider body and never the question.';

/* Dropped and recreated rather than overloaded. Adding a defaulted parameter
   creates a SECOND function with a different signature, and PostgREST then has
   to choose between them — an ambiguity that surfaces as a runtime error long
   after the migration looked successful. */
drop function if exists public.sky_settle(bigint, int, int, text, text, boolean);

create or replace function public.sky_settle(
  p_reservation bigint, p_input int, p_output int,
  p_provider text, p_model text, p_ok boolean,
  p_reason text default null)
returns void language plpgsql volatile security definer
set search_path = pg_catalog, public as $$
begin
  update public.sky_spend
     set settled_at = now(),
         input_tokens = greatest(coalesce(p_input, 0), 0),
         output_tokens = greatest(coalesce(p_output, 0), 0),
         reserved_tokens = case when p_ok
              then least(reserved_tokens,
                         greatest(coalesce(p_input,0) + coalesce(p_output,0), 0))
              else reserved_tokens end,
         provider = p_provider,
         model = p_model,
         ok = p_ok,
         fail_reason = case when p_ok then null else left(p_reason, 500) end
   where id = p_reservation;
end $$;

revoke execute on function
  public.sky_settle(bigint,int,int,text,text,boolean,text)
  from public, anon, authenticated;
grant execute on function
  public.sky_settle(bigint,int,int,text,text,boolean,text) to service_role;
