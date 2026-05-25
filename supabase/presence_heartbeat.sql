alter table public.profiles
  add column if not exists last_seen_at timestamptz,
  add column if not exists is_online boolean not null default false;

create index if not exists profiles_presence_idx
  on public.profiles (is_online, last_seen_at desc);

grant select on public.profiles to authenticated;
grant update (is_online, last_seen_at) on public.profiles to authenticated;

drop policy if exists "Users can update their own presence" on public.profiles;

create policy "Users can update their own presence"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
