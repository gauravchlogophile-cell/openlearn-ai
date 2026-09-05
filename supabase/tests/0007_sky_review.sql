-- pgTAP for 0014 — the review data the /admin/sky gates are computed from.
--
-- Two assertions here carry the weight, and both are about failing in the safe
-- direction rather than about the happy path.
--
--   · sky_gate_stats() must return NULL for wrong_rate on an empty table, not
--     zero. A rate of 0% from no reviews reads as "nothing is wrong" when it
--     means "nothing is known", and the console locks the "Everyone" stage
--     behind these gates — so a zero would unlock a stage on the strength of
--     no evidence at all. That is the exact failure the gates exist to prevent.
--
--   · record_sky_review() must refuse a caller who is neither admin nor owner.
--     The gates are a count of STAFF review. A signed-in learner able to write
--     rows would not just add noise; they could drive the count past 200 and
--     the wrong-rate under 2% and unlock Sky for everyone.
--
-- The second is checked from a real non-staff session rather than by reading
-- the grant, because EXECUTE is granted to `authenticated` deliberately — the
-- check lives inside the function, so only calling it proves anything.
--
-- is_owner() appears in the read policy alongside has_role('admin') because
-- 0012 established they are not the same thing: the owner is not an admin, and
-- that omission had already locked the owner out of four policies elsewhere.

begin;
select plan(21);

-- ------------------------------------------------------------------- shape

select has_table('public', 'sky_review', 'the review table exists');
select has_function('public', 'record_sky_review', 'the recorder exists');
select has_function('public', 'sky_gate_stats',    'the gate stats function exists');

select col_is_pk('public', 'sky_review', 'id', 'id is the primary key');
select col_not_null('public', 'sky_review', 'verdict', 'a review must carry a verdict');
select col_not_null('public', 'sky_review', 'sources', 'sources is never null');
select col_has_default('public', 'sky_review', 'sources',
  'sources defaults to empty, so a review without them is still recordable');

-- The question is optional BY DESIGN. P3·L8: a record of what people asked an
-- assistant is a second exposure, so nothing on the request path writes it.
select col_is_null('public', 'sky_review', 'question',
  'question is nullable — the route never captures it');
select col_is_null('public', 'sky_review', 'note', 'note is optional');

select ok(
  (select relrowsecurity from pg_class
    where oid = 'public.sky_review'::regclass),
  'row level security is enabled on sky_review');

-- ------------------------------------------------- the verdict vocabulary
--
-- Four, not three. "Refused" splits into declining something genuinely out of
-- scope (the assistant working) and declining something it should have
-- answered (a failure). Collapsing them would let a rise in wrong refusals
-- read as improving safety.

select lives_ok(
  $$ insert into public.sky_review (verdict) values ('good') $$,
  'good is a verdict');
select lives_ok(
  $$ insert into public.sky_review (verdict) values ('wrong') $$,
  'wrong is a verdict');
select lives_ok(
  $$ insert into public.sky_review (verdict) values ('refused_rightly') $$,
  'a correct refusal is its own verdict');
select lives_ok(
  $$ insert into public.sky_review (verdict) values ('refused_wrongly') $$,
  'a wrong refusal is distinguishable from a correct one');
select throws_ok(
  $$ insert into public.sky_review (verdict) values ('probably fine') $$,
  23514, null,
  'an unknown verdict is rejected rather than counted as something');

-- --------------------------------------------------------- the empty case

delete from public.sky_review;

select is(
  (select reviewed from public.sky_gate_stats()), 0::bigint,
  'an empty table reports nothing reviewed');

select is(
  (select wrong_rate from public.sky_gate_stats()), null,
  'wrong_rate is NULL on an empty table — a 0% rate from no reviews would '
  'read as "nothing is wrong" and unlock a stage on no evidence');

select is(
  (select refusal_signed_off from public.sky_gate_stats()), false,
  'with no approved decision, the sign-off gate is false rather than null');

-- ------------------------------------------------------------ the counting

insert into public.sky_review (verdict) values
  ('good'), ('good'), ('good'), ('wrong');

select is(
  (select reviewed from public.sky_gate_stats()), 4::bigint,
  'reviews are counted');

select is(
  (select wrong_rate from public.sky_gate_stats()), 0.2500::numeric,
  'the wrong rate is wrong over total, not wrong over good');

-- ------------------------------------------------------ who may write here
--
-- EXECUTE is granted to `authenticated` on purpose: the staff check is inside
-- the function, so reading the grant proves nothing and the call must be made.
-- A learner able to insert here could drive the count past the threshold and
-- the rate under it, unlocking Sky for everyone.

/* A signed-in identity with no role row: the shape of an ordinary learner.
   Deliberately NOT the owner uuid used in 0006, and deliberately no
   user_roles insert — the point is a caller who is authenticated and nothing
   more. set_config with is_local matches the idiom in 0006. */
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000aa"}', true);

select throws_ok(
  $$ select public.record_sky_review('good') $$,
  'P0001', 'only staff may review Sky answers',
  'a signed-in caller who is neither admin nor owner cannot record a review');

select * from finish();
rollback;
