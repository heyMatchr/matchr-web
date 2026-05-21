create extension if not exists pgcrypto;

alter table public.messages
  add column if not exists message_type text not null default 'text',
  add column if not exists media_url text,
  add column if not exists media_type text,
  add column if not exists expires_at timestamptz,
  add column if not exists viewed_at timestamptz,
  add column if not exists gift_type text;

do $$
begin
  alter table public.messages
    drop constraint if exists messages_message_type_check;

  alter table public.messages
    add constraint messages_message_type_check
    check (message_type in ('text', 'image', 'video', 'voice', 'gift', 'private_media'));

  alter table public.messages
    drop constraint if exists messages_content_check;

  alter table public.messages
    add constraint messages_content_check
    check (
      char_length(content) <= 1000
      and (
        (
          message_type = 'text'
          and char_length(trim(content)) > 0
        )
        or message_type <> 'text'
      )
    );
end;
$$;

create table if not exists public.moments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_url text not null,
  media_type text not null check (media_type in ('image', 'video')),
  caption text not null default '' check (char_length(caption) <= 500),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.moment_likes (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null references public.moments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint moment_likes_unique_user unique (moment_id, user_id)
);

create table if not exists public.moment_comments (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null references public.moments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (
    char_length(trim(content)) > 0
    and char_length(content) <= 500
  ),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.moment_gifts (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null references public.moments(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  gift_type text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint moment_gifts_no_self check (sender_id <> receiver_id)
);

create index if not exists moments_user_created_idx
  on public.moments (user_id, created_at desc);

create index if not exists moments_created_idx
  on public.moments (created_at desc);

create index if not exists moment_likes_moment_idx
  on public.moment_likes (moment_id);

create index if not exists moment_comments_moment_created_idx
  on public.moment_comments (moment_id, created_at desc);

create index if not exists moment_gifts_moment_created_idx
  on public.moment_gifts (moment_id, created_at desc);

alter table public.moments enable row level security;
alter table public.moment_likes enable row level security;
alter table public.moment_comments enable row level security;
alter table public.moment_gifts enable row level security;

grant usage on schema public to authenticated;
grant select, insert, delete on public.moments to authenticated;
grant select, insert, delete on public.moment_likes to authenticated;
grant select, insert on public.moment_comments to authenticated;
grant select, insert on public.moment_gifts to authenticated;
grant select, insert, update on public.messages to authenticated;

drop policy if exists "Users can create their moments" on public.moments;
drop policy if exists "Authenticated users can read moments" on public.moments;
drop policy if exists "Users can delete their moments" on public.moments;
drop policy if exists "Users can like moments" on public.moment_likes;
drop policy if exists "Users can unlike their moment likes" on public.moment_likes;
drop policy if exists "Authenticated users can read moment likes" on public.moment_likes;
drop policy if exists "Users can comment on moments" on public.moment_comments;
drop policy if exists "Authenticated users can read moment comments" on public.moment_comments;
drop policy if exists "Users can gift moments" on public.moment_gifts;
drop policy if exists "Authenticated users can read moment gifts" on public.moment_gifts;

create policy "Users can create their moments"
  on public.moments
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Authenticated users can read moments"
  on public.moments
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or not public.users_are_blocked(auth.uid(), user_id)
  );

create policy "Users can delete their moments"
  on public.moments
  for delete
  to authenticated
  using (auth.uid() = user_id);

create policy "Authenticated users can read moment likes"
  on public.moment_likes
  for select
  to authenticated
  using (true);

create policy "Users can like moments"
  on public.moment_likes
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.moments
      where moments.id = moment_likes.moment_id
        and not public.users_are_blocked(auth.uid(), moments.user_id)
    )
  );

create policy "Users can unlike their moment likes"
  on public.moment_likes
  for delete
  to authenticated
  using (auth.uid() = user_id);

create policy "Authenticated users can read moment comments"
  on public.moment_comments
  for select
  to authenticated
  using (true);

create policy "Users can comment on moments"
  on public.moment_comments
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.moments
      where moments.id = moment_comments.moment_id
        and not public.users_are_blocked(auth.uid(), moments.user_id)
    )
  );

create policy "Authenticated users can read moment gifts"
  on public.moment_gifts
  for select
  to authenticated
  using (true);

create policy "Users can gift moments"
  on public.moment_gifts
  for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and sender_id <> receiver_id
    and exists (
      select 1
      from public.moments
      where moments.id = moment_gifts.moment_id
        and moments.user_id = moment_gifts.receiver_id
        and not public.users_are_blocked(moment_gifts.sender_id, moment_gifts.receiver_id)
    )
  );

drop policy if exists "Users can create their follows" on public.follows;

create policy "Users can create their follows"
  on public.follows
  for insert
  to authenticated
  with check (
    follower_id = auth.uid()
    and follower_id <> following_id
    and not public.users_are_blocked(follower_id, following_id)
  );

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
        'private_media_received'
      )
    );
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can read media" on storage.objects;
drop policy if exists "Users can upload their media" on storage.objects;
drop policy if exists "Users can delete their media" on storage.objects;

create policy "Anyone can read media"
  on storage.objects
  for select
  to public
  using (bucket_id = 'media');

create policy "Users can upload their media"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete their media"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'moments'
  ) then
    alter publication supabase_realtime add table public.moments;
  end if;
end;
$$;
