create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists height text,
  add column if not exists weight text,
  add column if not exists body_type text,
  add column if not exists relationship_status text,
  add column if not exists country text,
  add column if not exists country_flag text,
  add column if not exists accepting_dating boolean not null default true,
  add column if not exists open_to_long_distance boolean not null default false,
  add column if not exists drinking text,
  add column if not exists smoking text,
  add column if not exists looking_for text;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  type text not null check (
    type in (
      'new_like',
      'new_match',
      'new_message',
      'profile_view',
      'new_follower'
    )
  ),
  title text not null,
  body text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.profile_views (
  id uuid primary key default gen_random_uuid(),
  viewer_id uuid not null references auth.users(id) on delete cascade,
  viewed_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint profile_views_no_self check (viewer_id <> viewed_user_id)
);

create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint follows_no_self check (follower_id <> following_id),
  constraint follows_unique_user_pair unique (follower_id, following_id)
);

create index if not exists notifications_user_created_at_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_read_at_idx
  on public.notifications (user_id, read_at);

create index if not exists profile_views_viewed_created_at_idx
  on public.profile_views (viewed_user_id, created_at desc);

create index if not exists profile_views_viewer_viewed_created_at_idx
  on public.profile_views (viewer_id, viewed_user_id, created_at desc);

create index if not exists notifications_user_actor_type_created_at_idx
  on public.notifications (user_id, actor_id, type, created_at desc);

create index if not exists follows_follower_idx
  on public.follows (follower_id);

create index if not exists follows_following_idx
  on public.follows (following_id);

alter table public.notifications enable row level security;
alter table public.profile_views enable row level security;
alter table public.follows enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on public.notifications to authenticated;
grant select, insert on public.profile_views to authenticated;
grant select, insert, delete on public.follows to authenticated;

drop policy if exists "Users can read their notifications" on public.notifications;
drop policy if exists "Users can update their notifications" on public.notifications;
drop policy if exists "Users can create notifications as actor" on public.notifications;
drop policy if exists "Users can create profile views" on public.profile_views;
drop policy if exists "Users can read related profile views" on public.profile_views;
drop policy if exists "Authenticated users can read profile views" on public.profile_views;
drop policy if exists "Authenticated users can read follows" on public.follows;
drop policy if exists "Users can create their follows" on public.follows;
drop policy if exists "Users can delete their follows" on public.follows;

create policy "Users can read their notifications"
  on public.notifications
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can update their notifications"
  on public.notifications
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can create notifications as actor"
  on public.notifications
  for insert
  to authenticated
  with check (
    actor_id = auth.uid()
    or user_id = auth.uid()
  );

create policy "Users can create profile views"
  on public.profile_views
  for insert
  to authenticated
  with check (
    viewer_id = auth.uid()
    and viewer_id <> viewed_user_id
  );

create policy "Authenticated users can read profile views"
  on public.profile_views
  for select
  to authenticated
  using (true);

create policy "Authenticated users can read follows"
  on public.follows
  for select
  to authenticated
  using (true);

create policy "Users can create their follows"
  on public.follows
  for insert
  to authenticated
  with check (
    follower_id = auth.uid()
    and follower_id <> following_id
  );

create policy "Users can delete their follows"
  on public.follows
  for delete
  to authenticated
  using (follower_id = auth.uid());

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'follows'
  ) then
    alter publication supabase_realtime add table public.follows;
  end if;
end;
$$;
