create extension if not exists pgcrypto;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text,
  auth text,
  device text,
  platform text,
  browser text,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  constraint push_subscriptions_user_endpoint_unique unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_active_idx
  on public.push_subscriptions (user_id, active, last_seen_at desc);

alter table public.user_settings
  add column if not exists push_messages boolean not null default true,
  add column if not exists push_matches boolean not null default true,
  add column if not exists push_gifts boolean not null default true,
  add column if not exists push_calls boolean not null default true,
  add column if not exists push_marketing boolean not null default false;

alter table public.push_subscriptions enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

drop policy if exists "Users can read their push subscriptions" on public.push_subscriptions;
drop policy if exists "Users can create their push subscriptions" on public.push_subscriptions;
drop policy if exists "Users can update their push subscriptions" on public.push_subscriptions;
drop policy if exists "Users can delete their push subscriptions" on public.push_subscriptions;

create policy "Users can read their push subscriptions"
  on public.push_subscriptions
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can create their push subscriptions"
  on public.push_subscriptions
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update their push subscriptions"
  on public.push_subscriptions
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete their push subscriptions"
  on public.push_subscriptions
  for delete
  to authenticated
  using (user_id = auth.uid());
