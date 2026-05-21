create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists ethnicity text,
  add column if not exists fashion_vibe text,
  add column if not exists workouts text,
  add column if not exists late_nights text,
  add column if not exists relationship_type text,
  add column if not exists last_active_at timestamptz,
  add column if not exists phone_verified boolean not null default false,
  add column if not exists identity_verified boolean not null default false,
  add column if not exists premium boolean not null default false;

create table if not exists public.profile_interests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  interest text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint profile_interests_unique unique (user_id, interest)
);

create table if not exists public.user_streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_streak integer not null default 0,
  story_streak integer not null default 0,
  message_streak integer not null default 0,
  last_activity_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.profile_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_type text not null,
  label text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint profile_badges_unique unique (user_id, badge_type)
);

create table if not exists public.discover_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  min_age integer not null default 18,
  max_age integer not null default 99,
  distance_miles integer not null default 50,
  gender_preference text not null default 'any',
  relationship_intent text,
  online_now boolean not null default false,
  has_stories boolean not null default false,
  verified_only boolean not null default false,
  has_moments boolean not null default false,
  accepting_dating boolean,
  sort_by text not null default 'compatible',
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists profile_interests_user_idx
  on public.profile_interests (user_id);

create index if not exists profile_badges_user_idx
  on public.profile_badges (user_id);

create index if not exists profiles_last_active_idx
  on public.profiles (last_active_at desc);

alter table public.profile_interests enable row level security;
alter table public.user_streaks enable row level security;
alter table public.profile_badges enable row level security;
alter table public.discover_preferences enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profile_interests to authenticated;
grant select, insert, update on public.user_streaks to authenticated;
grant select on public.profile_badges to authenticated;
grant select, insert, update on public.discover_preferences to authenticated;

drop policy if exists "Authenticated users can read profile interests" on public.profile_interests;
drop policy if exists "Users can manage their profile interests" on public.profile_interests;
drop policy if exists "Users can read visible streaks" on public.user_streaks;
drop policy if exists "Users can manage their streaks" on public.user_streaks;
drop policy if exists "Authenticated users can read profile badges" on public.profile_badges;
drop policy if exists "Users can read their discover preferences" on public.discover_preferences;
drop policy if exists "Users can manage their discover preferences" on public.discover_preferences;

create policy "Authenticated users can read profile interests"
  on public.profile_interests
  for select
  to authenticated
  using (true);

create policy "Users can manage their profile interests"
  on public.profile_interests
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can read visible streaks"
  on public.user_streaks
  for select
  to authenticated
  using (true);

create policy "Users can manage their streaks"
  on public.user_streaks
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Authenticated users can read profile badges"
  on public.profile_badges
  for select
  to authenticated
  using (true);

create policy "Users can read their discover preferences"
  on public.discover_preferences
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can manage their discover preferences"
  on public.discover_preferences
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

do $$
begin
  alter table public.notifications
    drop constraint if exists notifications_type_check;

  alter table public.notifications
    add constraint notifications_type_check
    check (
      type in (
        'new_like',
        'new_match',
        'new_message',
        'profile_view',
        'new_follower',
        'moment_like',
        'moment_comment',
        'gift_received',
        'private_media_received',
        'story_reaction',
        'story_reply',
        'story_gift',
        'low_gold',
        'mutual_attraction',
        'profile_trending',
        'streak_milestone',
        'profile_completion_reminder'
      )
    );
end;
$$;
