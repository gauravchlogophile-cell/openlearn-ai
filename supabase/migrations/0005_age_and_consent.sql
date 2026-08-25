-- 0005 · Guardian consent records, and learner data rights.
--
-- Policy, decided by the project owner:
--
--   Learning is open to every age, subject to whatever local law applies.
--   Education should not be age-gated, and it does not need to be — learning
--   anonymously processes NO personal data at all, so there is nothing for a
--   child-consent regime to attach to. Progress lives in the learner's own
--   browser.
--
--   Personal data only enters the picture in two places: creating an account
--   (an email address) and volunteering (an email address, sometimes a name).
--   Where the person is under 18, those require a parent or guardian's consent
--   first.
--
-- India's DPDP Act 2023 treats under-18s as children and requires VERIFIABLE
-- parental consent. GDPR Art.8 sets a lower floor (13-16 by member state) and
-- COPPA covers under-13s in the US. Whichever is stricter for the person is
-- what applies.
--
-- "Verifiable" is why consent here is a reply from the guardian's own email
-- address rather than a second checkbox on the child's screen. A checkbox the
-- child ticks on a guardian's behalf verifies nothing; an email from the
-- guardian is auditable, attributable, and can be withdrawn by the same person
-- who gave it.
--
-- This table is the record of that. It is deliberately administrator-only:
-- it contains a child's association with a guardian's contact details, which
-- is among the most sensitive data this project will ever hold.

create table if not exists public.guardian_consents (
  id bigserial primary key,
  -- Either an account holder, or a volunteer with no account at all.
  subject_user   uuid references public.profiles(id) on delete cascade,
  subject_label  text,                     -- for volunteers with no account
  scope          text not null check (scope in ('account', 'volunteer')),
  guardian_email citext not null,
  requested_at   timestamptz not null default now(),
  granted_at     timestamptz,              -- set when the guardian replies
  withdrawn_at   timestamptz,              -- a guardian may withdraw at any time
  policy_version text not null,
  note           text,
  check (subject_user is not null or subject_label is not null)
);

comment on table public.guardian_consents is
  'Parent/guardian consent for under-18 account holders and volunteers. '
  'Administrator-only. Never published. Deleted when the account closes or '
  'the volunteer task ends.';
comment on column public.guardian_consents.granted_at is
  'Set only on a reply from the guardian''s own address. A checkbox ticked by '
  'the child is not consent and must never populate this column.';
comment on column public.guardian_consents.withdrawn_at is
  'Withdrawal is immediate and unconditional. Once set, treat consent as absent.';

create index if not exists guardian_consents_subject
  on public.guardian_consents (subject_user);

alter table public.guardian_consents enable row level security;

-- Only owners and admins may read these rows. There is no policy allowing a
-- learner to read them, because the guardian's address is the guardian's, not
-- the child's to retrieve.
create policy "guardian consents: administrators only"
  on public.guardian_consents for select
  using (public.is_owner() or public.has_role('admin'));

-- No INSERT/UPDATE/DELETE policies: consent is recorded by an administrator
-- acting on a received email, through the function below, so that every record
-- carries an audit row naming who entered it.
revoke insert, update, delete on public.guardian_consents from anon, authenticated;

/** Records that a guardian has confirmed, or withdrawn. Administrator action:
 *  the human has read the reply and is attesting to it. Writes an audit row in
 *  the same transaction, so a consent record can never appear without someone's
 *  name against it. */
create or replace function public.record_guardian_consent(
  p_scope text, p_guardian_email text, p_policy_version text,
  p_subject_user uuid default null, p_subject_label text default null,
  p_granted boolean default true, p_note text default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid(); v_id bigint;
begin
  if not (public.is_owner() or public.has_role('admin')) then
    raise exception 'record_guardian_consent: administrators only';
  end if;
  if p_subject_user is null and coalesce(p_subject_label, '') = '' then
    raise exception 'record_guardian_consent: name the subject';
  end if;

  insert into guardian_consents
    (subject_user, subject_label, scope, guardian_email, policy_version, note,
     granted_at)
  values
    (p_subject_user, p_subject_label, p_scope, p_guardian_email, p_policy_version,
     p_note, case when p_granted then now() else null end)
  returning id into v_id;

  insert into admin_audit (actor, action, target, detail, reason)
  values (v_actor, 'record_guardian_consent', p_subject_user,
          jsonb_build_object('scope', p_scope, 'granted', p_granted, 'consent', v_id),
          p_note);
  return v_id;
end $$;

create or replace function public.withdraw_guardian_consent(
  p_consent bigint, p_reason text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid();
begin
  if not (public.is_owner() or public.has_role('admin')) then
    raise exception 'withdraw_guardian_consent: administrators only';
  end if;
  update guardian_consents set withdrawn_at = now() where id = p_consent;
  insert into admin_audit (actor, action, detail, reason)
  values (v_actor, 'withdraw_guardian_consent',
          jsonb_build_object('consent', p_consent), p_reason);
end $$;

revoke execute on function public.record_guardian_consent(text,text,text,uuid,text,boolean,text) from public, anon;
revoke execute on function public.withdraw_guardian_consent(bigint,text) from public, anon;
grant  execute on function public.record_guardian_consent(text,text,text,uuid,text,boolean,text) to authenticated;
grant  execute on function public.withdraw_guardian_consent(bigint,text) to authenticated;

-- ------------------------------------------------------------ data rights
-- DPDP and GDPR both give a right to erasure, and the privacy page promises
-- it. Doing that by hand through the dashboard does not scale, and is exactly
-- the sort of promise that quietly stops being kept.
--
-- Deleting the auth user cascades to profiles, and profiles cascades to
-- lesson_progress, reward_events, reward_balances, user_roles and any consent
-- record. The audit log keeps its rows because it must not be rewritable, but
-- actor/target are ON DELETE SET NULL — so the person is unlinked from the
-- history rather than the history being falsified.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'delete_my_account: not authenticated';
  end if;
  insert into admin_audit (actor, action, target, detail, reason)
  values (v_user, 'self_delete', v_user, '{}'::jsonb, 'learner-initiated erasure');
  delete from auth.users where id = v_user;
end $$;

revoke execute on function public.delete_my_account() from public, anon;
grant  execute on function public.delete_my_account() to authenticated;
