create extension if not exists pgcrypto;

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  user_one_id uuid not null references auth.users(id) on delete cascade,
  user_two_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint matches_no_self check (user_one_id <> user_two_id),
  constraint matches_ordered_users check (user_one_id < user_two_id),
  constraint matches_unique_pair unique (user_one_id, user_two_id)
);

alter table public.matches enable row level security;

grant usage on schema public to authenticated;
grant select, insert on public.matches to authenticated;

drop policy if exists "Users can read their matches" on public.matches;
drop policy if exists "Users can create reciprocal matches" on public.matches;
drop policy if exists "Users can create their matches" on public.matches;

create policy "Users can read their matches"
  on public.matches
  for select
  to authenticated
  using (auth.uid() = user_one_id or auth.uid() = user_two_id);

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

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;
end;
$$;
