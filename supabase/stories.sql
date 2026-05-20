create extension if not exists pgcrypto;

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_url text,
  text text not null default '' check (char_length(text) <= 220),
  background_style text not null default 'emerald',
  expires_at timestamptz not null default (timezone('utc', now()) + interval '24 hours'),
  created_at timestamptz not null default timezone('utc', now()),
  constraint stories_has_content check (
    media_url is not null
    or char_length(trim(text)) > 0
  )
);

create table if not exists public.story_views (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint story_views_unique_viewer unique (story_id, viewer_id)
);

create index if not exists stories_user_expires_created_idx
  on public.stories (user_id, expires_at, created_at desc);

create index if not exists stories_expires_created_idx
  on public.stories (expires_at, created_at desc);

create index if not exists story_views_story_viewer_idx
  on public.story_views (story_id, viewer_id);

alter table public.stories enable row level security;
alter table public.story_views enable row level security;

grant usage on schema public to authenticated;
grant select, insert, delete on public.stories to authenticated;
grant select, insert on public.story_views to authenticated;

drop policy if exists "Users can create their stories" on public.stories;
drop policy if exists "Users can read visible active stories" on public.stories;
drop policy if exists "Users can delete their stories" on public.stories;
drop policy if exists "Users can create story views" on public.story_views;
drop policy if exists "Users can read their story viewers" on public.story_views;

create policy "Users can create their stories"
  on public.stories
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can read visible active stories"
  on public.stories
  for select
  to authenticated
  using (
    expires_at > timezone('utc', now())
    and (
      auth.uid() = user_id
      or exists (
        select 1
        from public.profiles
        where profiles.id = stories.user_id
          and profiles.onboarding_completed = true
      )
      or exists (
        select 1
        from public.follows
        where follows.follower_id = auth.uid()
          and follows.following_id = stories.user_id
      )
      or exists (
        select 1
        from public.matches
        where (
          matches.user_one_id = auth.uid()
          and matches.user_two_id = stories.user_id
        )
        or (
          matches.user_two_id = auth.uid()
          and matches.user_one_id = stories.user_id
        )
      )
    )
  );

create policy "Users can delete their stories"
  on public.stories
  for delete
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create story views"
  on public.story_views
  for insert
  to authenticated
  with check (
    auth.uid() = viewer_id
    and exists (
      select 1
      from public.stories
      where stories.id = story_views.story_id
        and stories.expires_at > timezone('utc', now())
    )
  );

create policy "Users can read their story viewers"
  on public.story_views
  for select
  to authenticated
  using (
    viewer_id = auth.uid()
    or exists (
      select 1
      from public.stories
      where stories.id = story_views.story_id
        and stories.user_id = auth.uid()
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'stories',
  'stories',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can read stories media" on storage.objects;
drop policy if exists "Users can upload their stories media" on storage.objects;
drop policy if exists "Users can delete their stories media" on storage.objects;

create policy "Anyone can read stories media"
  on storage.objects
  for select
  to public
  using (bucket_id = 'stories');

create policy "Users can upload their stories media"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'stories'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete their stories media"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'stories'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'stories'
  ) then
    alter publication supabase_realtime add table public.stories;
  end if;
end;
$$;
