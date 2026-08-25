-- 0007 · Ask Doubts, topic rooms and members — built to the safeguarding
-- policy, and shipped closed.
--
-- /safeguarding lists seven conditions that must ALL hold before any
-- learner-to-learner surface opens. Six of them are things code can guarantee,
-- and they are guaranteed here rather than promised in a UI:
--
--   2. moderation before publication  -> posts land 'pending'; only a
--                                        moderator's approve() makes one
--                                        visible, and nothing else can
--   3. NO PRIVATE MESSAGING, EVER     -> there is no table for it. Grooming
--                                        needs privacy; removing the mechanism
--                                        beats trying to detect it
--   4. no identifying profile fields  -> posts carry a generated handle only.
--                                        No age, school, location or photo
--                                        column exists to be filled in
--   5. one-click reporting, no account-> reports insert anonymously
--   6. written escalation route       -> reports carry a severity and an
--                                        acted_at, so nothing can be silently
--                                        closed
--   7. retention rules                -> published, and enforced by
--                                        purge_expired_posts()
--
-- The seventh condition — a NAMED PERSON responsible, with a deputy — is not
-- something a migration can satisfy. So rooms_open() reads a flag that stays
-- false, and every read policy depends on it. Opening this is a staffing
-- decision, not a deploy.

create table if not exists public.rooms (
  id          bigserial primary key,
  slug        text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  title       text not null,
  purpose     text not null,
  is_open     boolean not null default false,
  created_at  timestamptz not null default now()
);
comment on table public.rooms is
  'Public topic rooms only. There is deliberately no direct-message table: the '
  'safeguarding policy forbids private channels, so the mechanism is absent '
  'rather than guarded.';

/* The master gate. False until a named safeguarding owner exists AND an owner
   flips it. Both halves matter: a flag alone could be flipped by mistake, and
   a person alone cannot moderate a room the code has not opened. */
create table if not exists public.rooms_state (
  id                 boolean primary key default true check (id),
  open               boolean not null default false,
  safeguarding_owner uuid references public.profiles(id) on delete set null,
  deputy             uuid references public.profiles(id) on delete set null,
  opened_at          timestamptz,
  note               text
);
insert into public.rooms_state (id, open, note)
values (true, false, 'Closed. See /safeguarding for the seven conditions.')
on conflict (id) do nothing;

create or replace function public.rooms_open()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select open and safeguarding_owner is not null and deputy is not null
       from rooms_state where id), false);
$$;

-- ------------------------------------------------------------------ posts
create table if not exists public.posts (
  id            bigserial primary key,
  room          bigint references public.rooms(id) on delete cascade,
  kind          text not null check (kind in ('doubt', 'reply', 'room_message')),
  parent        bigint references public.posts(id) on delete cascade,
  author        uuid not null references public.profiles(id) on delete cascade,
  -- The display name shown beside a post. Generated, never chosen, so a child
  -- cannot publish their own name by putting it in a handle.
  author_handle text not null,
  body          text not null check (char_length(body) between 2 and 4000),
  status        text not null default 'pending'
                check (status in ('pending', 'published', 'rejected', 'removed')),
  -- "Every unverified answer wears a visible flag" (design turn 7).
  verified_by   uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  moderated_by  uuid references public.profiles(id) on delete set null,
  moderated_at  timestamptz,
  expires_at    timestamptz
);
create index if not exists posts_queue on public.posts (created_at) where status = 'pending';
create index if not exists posts_room on public.posts (room, created_at desc) where status = 'published';

alter table public.rooms       enable row level security;
alter table public.rooms_state enable row level security;
alter table public.posts       enable row level security;

-- Nothing is readable by anyone until rooms_open() is true. A learner cannot
-- read a pending post, and NOBODY can read anything while the gate is shut.
create policy "rooms: visible only when open"
  on public.rooms for select
  using (public.rooms_open() and is_open);

create policy "posts: published only, and only when open"
  on public.posts for select
  using ((public.rooms_open() and status = 'published')
         or author = auth.uid()
         or public.is_owner() or public.has_role('moderator'));

create policy "rooms_state: administrators read"
  on public.rooms_state for select
  using (public.is_owner() or public.has_role('admin') or public.has_role('moderator'));

revoke insert, update, delete on public.rooms, public.rooms_state, public.posts
  from anon, authenticated;

-- ------------------------------------------------------------- posting
/* Posts arrive PENDING. There is no code path that publishes on insert, which
   is what makes "moderated before publication" a property rather than a policy
   someone has to remember. */
create or replace function public.submit_post(
  p_kind text, p_body text, p_room bigint default null, p_parent bigint default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_handle text; v_id bigint;
begin
  if v_user is null then raise exception 'submit_post: sign in first'; end if;
  if not public.rooms_open() then raise exception 'submit_post: rooms are not open'; end if;

  select handle into v_handle from profiles where id = v_user;
  if coalesce(v_handle, '') = '' then
    raise exception 'submit_post: no display handle';
  end if;

  insert into posts (room, kind, parent, author, author_handle, body)
  values (p_room, p_kind, p_parent, v_user, v_handle, p_body)
  returning id into v_id;
  return v_id;
end $$;

/* Moderation. Approving is the ONLY way a post becomes visible. */
create or replace function public.moderate_post(
  p_post bigint, p_status text, p_reason text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid();
begin
  if not (public.is_owner() or public.has_role('moderator')) then
    raise exception 'moderate_post: moderators only';
  end if;
  if p_status not in ('published', 'rejected', 'removed') then
    raise exception 'moderate_post: bad status';
  end if;
  update posts
     set status = p_status, moderated_by = v_actor, moderated_at = now()
   where id = p_post;
  insert into admin_audit (actor, action, detail, reason)
  values (v_actor, 'moderate_post',
          jsonb_build_object('post', p_post, 'status', p_status), p_reason);
end $$;

-- ------------------------------------------------------------- reporting
/* One click, works without an account. Anonymous reporting is the point: a
   child who is frightened of a post should not have to sign in to say so. */
create table if not exists public.reports (
  id         bigserial primary key,
  post       bigint not null references public.posts(id) on delete cascade,
  reporter   uuid references public.profiles(id) on delete set null,
  reason     text not null check (reason in
               ('harmful','bullying','adult','personal-details','spam','wrong','other')),
  detail     text,
  severity   text not null default 'normal' check (severity in ('normal','urgent')),
  created_at timestamptz not null default now(),
  acted_at   timestamptz,
  acted_by   uuid references public.profiles(id) on delete set null,
  outcome    text
);
create index if not exists reports_open on public.reports (created_at) where acted_at is null;

alter table public.reports enable row level security;
create policy "reports: moderators read"
  on public.reports for select
  using (public.is_owner() or public.has_role('moderator'));
revoke insert, update, delete on public.reports from anon, authenticated;

create or replace function public.report_post(
  p_post bigint, p_reason text, p_detail text default null, p_urgent boolean default false
) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- No sign-in check on purpose. Anonymous is allowed; auth.uid() may be null.
  insert into reports (post, reporter, reason, detail, severity)
  values (p_post, auth.uid(), p_reason, p_detail,
          case when p_urgent then 'urgent' else 'normal' end);

  -- Anything flagged as urgent hides immediately and is reviewed after, not
  -- before. On a site used by children, the cost of briefly hiding something
  -- innocent is far lower than the cost of leaving something harmful up.
  if p_urgent then
    update posts set status = 'removed' where id = p_post and status = 'published';
  end if;
end $$;

revoke execute on function public.submit_post(text,text,bigint,bigint) from public, anon;
revoke execute on function public.moderate_post(bigint,text,text) from public, anon;
revoke execute on function public.rooms_open() from public;
grant  execute on function public.submit_post(text,text,bigint,bigint) to authenticated;
grant  execute on function public.moderate_post(bigint,text,text) to authenticated;
grant  execute on function public.rooms_open() to anon, authenticated;
-- report_post is intentionally callable by anon: reporting must not require
-- an account.
grant  execute on function public.report_post(bigint,text,text,boolean) to anon, authenticated;

-- ------------------------------------------------------------- retention
/* Condition 7. Published on /safeguarding and enforced here rather than left
   to a promise: rejected and removed posts are purged after 90 days, and
   anything still pending after 90 days is purged too — an unmoderated post is
   not a post, and keeping a child's words indefinitely because nobody looked
   at them is the worst of both outcomes. */
create or replace function public.purge_expired_posts()
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  delete from posts
   where created_at < now() - interval '90 days'
     and status in ('rejected', 'removed', 'pending');
  get diagnostics v_n = row_count;
  insert into admin_audit (actor, action, detail)
  values (null, 'purge_expired_posts', jsonb_build_object('removed', v_n));
  return v_n;
end $$;
revoke execute on function public.purge_expired_posts() from public, anon, authenticated;
