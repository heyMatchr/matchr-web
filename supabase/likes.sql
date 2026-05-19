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

alter table public.likes enable row level security;
alter table public.passes enable row level security;

grant usage on schema public to authenticated;
grant select, insert on public.likes to authenticated;
grant select, insert on public.passes to authenticated;

drop policy if exists "Users can read their likes" on public.likes;
drop policy if exists "Users can read likes involving them" on public.likes;
drop policy if exists "Users can create their likes" on public.likes;
drop policy if exists "Users can read their passes" on public.passes;
drop policy if exists "Users can create their passes" on public.passes;

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
