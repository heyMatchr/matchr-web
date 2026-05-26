create extension if not exists pgcrypto;

create table if not exists public.action_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null,
  target_id uuid,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists action_limits_user_action_created_idx
  on public.action_limits (user_id, action_type, created_at desc);

create index if not exists action_limits_user_target_created_idx
  on public.action_limits (user_id, target_id, created_at desc);

alter table public.action_limits enable row level security;

grant usage on schema public to authenticated;
grant select, insert on public.action_limits to authenticated;

drop policy if exists "Users can read their action limits" on public.action_limits;
drop policy if exists "Users can create their action limits" on public.action_limits;

create policy "Users can read their action limits"
  on public.action_limits
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can create their action limits"
  on public.action_limits
  for insert
  to authenticated
  with check (user_id = auth.uid());
