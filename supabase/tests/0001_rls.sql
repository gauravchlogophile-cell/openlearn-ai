-- pgTAP RLS tests — Sprint 1 slice of the Phase 6 §4 matrix (NFR-SEC-1).
-- Run: supabase test db
begin;
select plan(6);

select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'reward_events', 'reward_events exists');

-- RLS enabled everywhere
select ok((select relrowsecurity from pg_class where relname='profiles'), 'RLS on profiles');
select ok((select relrowsecurity from pg_class where relname='reward_events'), 'RLS on reward_events');

-- No direct write policies on the ledger (function-only invariant, FR-GAME-1)
select is(
  (select count(*)::int from pg_policies
    where tablename='reward_events' and cmd in ('INSERT','UPDATE','DELETE')),
  0, 'ledger has zero direct write policies');

-- award() exists and is definer
select ok(
  (select prosecdef from pg_proc where proname='award'),
  'award() is SECURITY DEFINER');

select * from finish();
rollback;
