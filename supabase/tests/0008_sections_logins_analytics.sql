-- pgTAP for 0017 — section switches, sign-in record, anonymous page counts, and
-- the board with streaks.
--
-- What matters most is who CANNOT do each thing: a browser must not be able to
-- write page counts (it could flood them), an anonymous visitor must not be able
-- to flip a section, and nobody but staff may read the counts or the sign-ins.
begin;
select plan(13);

select has_table('public', 'site_sections', 'site_sections exists');
select has_table('public', 'login_events',  'login_events exists');
select has_table('public', 'site_hits',     'site_hits exists');

select is((select count(*)::int from public.site_sections), 11, 'eleven sections are seeded');
select is((select count(*)::int from public.site_sections where state <> 'planned'), 0,
  'every section starts as planned: nothing is open before an owner says it is built');

-- The three that carry learner-written text are flagged, and nothing else is.
select is((select string_agg(key, ',' order by key) from public.site_sections where needs_safeguarding),
  'doubts,members,rooms', 'only the sections that carry learner writing need the safeguarding gate');

-- Who can call what.
select ok(not has_function_privilege('anon', 'public.set_section_state(text, text, text)', 'execute'),
  'an anonymous visitor cannot switch a section');
select ok(not has_function_privilege('authenticated', 'public.record_hit(text, text, text, text)', 'execute')
      and not has_function_privilege('anon', 'public.record_hit(text, text, text, text)', 'execute'),
  'a browser cannot write page counts: only the Worker, through the service role');

select ok((select relrowsecurity from pg_class where oid = 'public.site_hits'::regclass)
      and (select relrowsecurity from pg_class where oid = 'public.login_events'::regclass),
  'page counts and sign-ins are behind row-level security');

-- Without a signed-in admin the switch refuses.
select throws_ok($$select public.set_section_state('blog', 'closed')$$,
  'set_section_state: an admin or an owner only', 'no signed-in admin, no switch');

-- record_hit cleans what it is given: no query string, no junk device, no junk
-- country, no junk channel. A counter that stored whatever it was sent would be
-- a place to put a person's identifier.
select public.record_hit('/zz-test?email=a@b.c#frag', 'weird', 'india', 'BAD CHANNEL');
select is((select row(path, device, country, via)::text from public.site_hits where path like '/zz-test%'),
  '(/zz-test,unknown,ZZ,"")', 'the path loses its query string; device, country and channel fall back to unknown');

select is(public.learning_streak('00000000-0000-0000-0000-000000000000'::uuid, 'UTC'), 0,
  'a person with no activity has a streak of zero');
select throws_ok($$select * from public.sky_board('year')$$,
  'sky_board: scope must be today or week', 'the board refuses a scope it does not know');

select * from finish();
rollback;
