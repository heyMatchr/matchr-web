create extension if not exists pgcrypto;

create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  liker_id uuid not null references auth.users(id) on delete cascade,
  liked_profile_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint likes_no_self check (liker_id <> liked_profile_id),
  constraint likes_unique_user_profile unique (liker_id, liked_profile_id)
);

create table if not exists public.passes (
  id uuid primary key default gen_random_uuid(),
  passer_id uuid not null references auth.users(id) on delete cascade,
  passed_profile_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint passes_no_self check (passer_id <> passed_profile_id),
  constraint passes_unique_user_profile unique (passer_id, passed_profile_id)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  user_one_id uuid not null references auth.users(id) on delete cascade,
  user_two_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint matches_no_self check (user_one_id <> user_two_id),
  constraint matches_ordered_users check (user_one_id < user_two_id),
  constraint matches_unique_pair unique (user_one_id, user_two_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  content text not null check (char_length(content) > 0 and char_length(content) <= 1000),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.likes enable row level security;
alter table public.passes enable row level security;
alter table public.matches enable row level security;
alter table public.messages enable row level security;

grant usage on schema public to authenticated;
grant select, insert on public.likes to authenticated;
grant select, insert on public.passes to authenticated;
grant select, insert on public.matches to authenticated;
grant select, insert on public.messages to authenticated;

drop policy if exists "Users can read their likes" on public.likes;
drop policy if exists "Users can read likes involving them" on public.likes;
drop policy if exists "Users can create their likes" on public.likes;
drop policy if exists "Users can read their passes" on public.passes;
drop policy if exists "Users can create their passes" on public.passes;
drop policy if exists "Users can read their matches" on public.matches;
drop policy if exists "Users can create their matches" on public.matches;
drop policy if exists "Users can read match messages" on public.messages;
drop policy if exists "Users can send match messages" on public.messages;

create policy "Users can read likes involving them"
  on public.likes
  for select
  to authenticated
  using (auth.uid() = liker_id or auth.uid() = liked_profile_id);

create policy "Users can create their likes"
  on public.likes
  for insert
  to authenticated
  with check (auth.uid() = liker_id);

create policy "Users can read their passes"
  on public.passes
  for select
  to authenticated
  using (auth.uid() = passer_id);

create policy "Users can create their passes"
  on public.passes
  for insert
  to authenticated
  with check (auth.uid() = passer_id);

create policy "Users can read their matches"
  on public.matches
  for select
  to authenticated
  using (auth.uid() = user_one_id or auth.uid() = user_two_id);

create policy "Users can create their matches"
  on public.matches
  for insert
  to authenticated
  with check (auth.uid() = user_one_id or auth.uid() = user_two_id);

drop policy if exists "Users can create reciprocal matches" on public.matches;
drop policy if exists "Users can create their matches" on public.matches;

create policy "Users can create reciprocal matches"
  on public.matches
  for insert
  to authenticated
  with check (
    (auth.uid() = user_one_id or auth.uid() = user_two_id)
    and exists (
      select 1
      from public.likes
      where likes.liker_id = user_one_id
        and likes.liked_profile_id = user_two_id
    )
    and exists (
      select 1
      from public.likes
      where likes.liker_id = user_two_id
        and likes.liked_profile_id = user_one_id
    )
  );

create policy "Users can read match messages"
  on public.messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.matches
      where matches.id = messages.match_id
        and (matches.user_one_id = auth.uid() or matches.user_two_id = auth.uid())
    )
  );

create policy "Users can send match messages"
  on public.messages
  for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and exists (
      select 1
      from public.matches
      where matches.id = messages.match_id
        and (matches.user_one_id = auth.uid() or matches.user_two_id = auth.uid())
        and (messages.receiver_id = matches.user_one_id or messages.receiver_id = matches.user_two_id)
        and messages.receiver_id <> auth.uid()
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;
