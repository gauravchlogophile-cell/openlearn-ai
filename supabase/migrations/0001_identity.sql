-- 0001 · Identity & roles (Phase 6 §3.1) — RLS-first from the first migration.
create extension if not exists citext;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle citext unique check (handle ~ '^[a-z0-9_]{3,24}$'),
  display_name text check (char_length(display_name) <= 60),
  avatar_config jsonb not null default '{}',
  timezone text not null default 'UTC',
  locale text not null default 'en',
  goal_mode text not null default 'daily' check (goal_mode in ('daily','weekly')),
  profile_public boolean not null default false,
  leaderboard_opt_in boolean not null default false,
  onboarded_track text check (onboarded_track in ('explorer','practitioner','builder')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'Learner profile; sensitive auth data stays in auth schema.';
comment on column public.profiles.timezone is 'Streak day boundaries (4am cutoff) computed in this zone.';

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('reviewer','moderator','editor','admin')),
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);
comment on table public.user_roles is 'Extra roles; learner is implicit. Grants only via admin fn (audited).';

create or replace function public.has_role(wanted text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = auth.uid() and role = wanted);
$$;

-- Auto-provision profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

create policy "profiles: read own or public"
  on public.profiles for select
  using (id = auth.uid() or profile_public or public.has_role('admin'));

create policy "profiles: update own"
  on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

create policy "roles: read own"
  on public.user_roles for select using (user_id = auth.uid() or public.has_role('admin'));
-- No insert/update/delete policies: role grants happen only via a definer fn (later migration).
