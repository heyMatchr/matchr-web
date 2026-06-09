create extension if not exists pgcrypto;

alter table public.profile_media
  drop constraint if exists profile_media_type_check;

alter table public.profile_media
  add constraint profile_media_type_check check (
    media_type in ('preview_video', 'gallery_photo', 'gallery_video')
  );

alter table public.profile_media
  drop constraint if exists profile_media_duration_check;

alter table public.profile_media
  add constraint profile_media_duration_check check (
    (
      media_type = 'preview_video'
      and (
        duration_seconds is null
        or (
          duration_seconds > 0
          and duration_seconds <= 15
        )
      )
    )
    or (
      media_type = 'gallery_video'
      and duration_seconds is not null
      and duration_seconds > 0
      and duration_seconds <= 15
    )
    or (
      media_type = 'gallery_photo'
      and duration_seconds is null
    )
  );

create or replace function public.enforce_profile_gallery_photo_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  active_gallery_count integer;
begin
  if new.media_type not in ('gallery_photo', 'gallery_video') or new.active is not true then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.user_id::text || ':profile_gallery'));

  select count(*)
  into active_gallery_count
  from public.profile_media
  where user_id = new.user_id
    and media_type in ('gallery_photo', 'gallery_video')
    and active = true
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if active_gallery_count >= 8 then
    raise exception 'profile_gallery_limit_reached';
  end if;

  return new;
end;
$$;

drop policy if exists "Users can create their profile media" on public.profile_media;
drop policy if exists "Users can update their profile media" on public.profile_media;
drop policy if exists "Users can delete their profile media" on public.profile_media;

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
  array[
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update
set
  public = true,
  file_size_limit = greatest(
    coalesce(storage.buckets.file_size_limit, 0),
    excluded.file_size_limit
  ),
  allowed_mime_types = excluded.allowed_mime_types;
