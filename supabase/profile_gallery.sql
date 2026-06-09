create extension if not exists pgcrypto;

alter table public.profile_media
  add column if not exists sort_order integer not null default 0,
  add column if not exists caption text;

alter table public.profile_media
  drop constraint if exists profile_media_type_check;

alter table public.profile_media
  add constraint profile_media_type_check check (
    media_type in ('preview_video', 'gallery_photo')
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
      media_type = 'gallery_photo'
      and duration_seconds is null
    )
  );

create index if not exists profile_media_user_type_active_sort_idx
  on public.profile_media (user_id, media_type, active, sort_order, created_at desc);

create or replace function public.enforce_profile_gallery_photo_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  active_gallery_count integer;
begin
  if new.media_type <> 'gallery_photo' or new.active is not true then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.user_id::text || ':profile_gallery'));

  select count(*)
  into active_gallery_count
  from public.profile_media
  where user_id = new.user_id
    and media_type = 'gallery_photo'
    and active = true
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if active_gallery_count >= 8 then
    raise exception 'profile_gallery_limit_reached';
  end if;

  return new;
end;
$$;

drop trigger if exists profile_gallery_photo_limit on public.profile_media;

create trigger profile_gallery_photo_limit
  before insert or update of user_id, media_type, active
  on public.profile_media
  for each row
  execute function public.enforce_profile_gallery_photo_limit();

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
