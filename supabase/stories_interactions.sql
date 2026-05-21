create extension if not exists pgcrypto;

alter table public.messages
  add column if not exists story_id uuid references public.stories(id) on delete set null;

do $$
begin
  alter table public.messages
    drop constraint if exists messages_message_type_check;

  alter table public.messages
    add constraint messages_message_type_check
    check (
      message_type in (
        'text',
        'image',
        'video',
        'voice',
        'gift',
        'private_media',
        'story_reply',
        'story_reaction',
        'story_gift',
        'private_media_opened',
        'private_media_expired'
      )
    );

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

create table if not exists public.story_reactions (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  reactor_id uuid not null references auth.users(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  reaction_type text not null check (
    reaction_type in ('heart', 'fire', 'eyes', 'emerald')
  ),
  created_at timestamptz not null default timezone('utc', now()),
  constraint story_reactions_no_self check (reactor_id <> owner_id),
  constraint story_reactions_unique_user unique (story_id, reactor_id, reaction_type)
);

create table if not exists public.story_replies (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (
    char_length(trim(content)) > 0
    and char_length(content) <= 1000
  ),
  created_at timestamptz not null default timezone('utc', now()),
  constraint story_replies_no_self check (sender_id <> receiver_id)
);

create table if not exists public.story_gifts (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  gift_type text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint story_gifts_no_self check (sender_id <> receiver_id)
);

create index if not exists story_reactions_story_created_idx
  on public.story_reactions (story_id, created_at desc);

create index if not exists story_reactions_owner_created_idx
  on public.story_reactions (owner_id, created_at desc);

create index if not exists story_replies_story_created_idx
  on public.story_replies (story_id, created_at desc);

create index if not exists story_gifts_story_created_idx
  on public.story_gifts (story_id, created_at desc);

alter table public.story_reactions enable row level security;
alter table public.story_replies enable row level security;
alter table public.story_gifts enable row level security;

grant usage on schema public to authenticated;
grant select, insert on public.story_reactions to authenticated;
grant select, insert on public.story_replies to authenticated;
grant select, insert on public.story_gifts to authenticated;
grant select, insert, update on public.messages to authenticated;

drop policy if exists "Users can create story reactions" on public.story_reactions;
drop policy if exists "Users can read story reactions" on public.story_reactions;
drop policy if exists "Users can create story replies" on public.story_replies;
drop policy if exists "Users can read story replies" on public.story_replies;
drop policy if exists "Users can create story gifts" on public.story_gifts;
drop policy if exists "Users can read story gifts" on public.story_gifts;

create policy "Users can create story reactions"
  on public.story_reactions
  for insert
  to authenticated
  with check (
    reactor_id = auth.uid()
    and reactor_id <> owner_id
    and exists (
      select 1
      from public.stories
      where stories.id = story_reactions.story_id
        and stories.user_id = story_reactions.owner_id
        and stories.expires_at > timezone('utc', now())
        and not public.users_are_blocked(story_reactions.reactor_id, story_reactions.owner_id)
    )
  );

create policy "Users can read story reactions"
  on public.story_reactions
  for select
  to authenticated
  using (reactor_id = auth.uid() or owner_id = auth.uid());

create policy "Users can create story replies"
  on public.story_replies
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and sender_id <> receiver_id
    and exists (
      select 1
      from public.stories
      where stories.id = story_replies.story_id
        and stories.user_id = story_replies.receiver_id
        and stories.expires_at > timezone('utc', now())
        and not public.users_are_blocked(story_replies.sender_id, story_replies.receiver_id)
    )
  );

create policy "Users can read story replies"
  on public.story_replies
  for select
  to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid());

create policy "Users can create story gifts"
  on public.story_gifts
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and sender_id <> receiver_id
    and exists (
      select 1
      from public.stories
      where stories.id = story_gifts.story_id
        and stories.user_id = story_gifts.receiver_id
        and stories.expires_at > timezone('utc', now())
        and not public.users_are_blocked(story_gifts.sender_id, story_gifts.receiver_id)
    )
  );

create policy "Users can read story gifts"
  on public.story_gifts
  for select
  to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid());

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
        'story_gift'
      )
    );

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'story_reactions'
  ) then
    alter publication supabase_realtime add table public.story_reactions;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'story_replies'
  ) then
    alter publication supabase_realtime add table public.story_replies;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'story_gifts'
  ) then
    alter publication supabase_realtime add table public.story_gifts;
  end if;
end;
$$;
