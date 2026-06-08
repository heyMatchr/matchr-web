create extension if not exists pgcrypto;

create table if not exists public.profile_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  media_type text not null default 'preview_video',
  storage_path text not null,
  media_url text not null,
  thumbnail_url text,
  duration_seconds numeric,
  mime_type text,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profile_media_type_check check (media_type in ('preview_video')),
  constraint profile_media_duration_check check (
    duration_seconds is null
    or (
      duration_seconds > 0
      and duration_seconds <= 15
    )
  )
);

create unique index if not exists profile_media_one_active_preview_video_idx
  on public.profile_media (user_id, media_type)
  where active = true and media_type = 'preview_video';

create index if not exists profile_media_user_type_active_idx
  on public.profile_media (user_id, media_type, active, created_at desc);

drop trigger if exists profile_media_set_updated_at on public.profile_media;

create trigger profile_media_set_updated_at
  before update on public.profile_media
  for each row
  execute function public.set_updated_at();

alter table public.profile_media enable row level security;

grant usage on schema public to authenticated;
grant select on public.profile_media to public;
grant insert, update, delete on public.profile_media to authenticated;

drop policy if exists "Public can read active profile media" on public.profile_media;
drop policy if exists "Users can create their profile media" on public.profile_media;
drop policy if exists "Users can update their profile media" on public.profile_media;
drop policy if exists "Users can delete their profile media" on public.profile_media;

create policy "Public can read active profile media"
  on public.profile_media
  for select
  to public
  using (active = true);

create policy "Users can create their profile media"
  on public.profile_media
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update their profile media"
  on public.profile_media
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete their profile media"
  on public.profile_media
  for delete
  to authenticated
  using (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-media',
  'profile-media',
  true,
  20971520,
  array['video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update
set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can read profile media" on storage.objects;
drop policy if exists "Users can upload their profile media" on storage.objects;
drop policy if exists "Users can update their profile media" on storage.objects;
drop policy if exists "Users can delete their profile media" on storage.objects;

create policy "Anyone can read profile media"
  on storage.objects
  for select
  to public
  using (bucket_id = 'profile-media');

create policy "Users can upload their profile media"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'profile-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can update their profile media"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'profile-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'profile-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete their profile media"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'profile-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
