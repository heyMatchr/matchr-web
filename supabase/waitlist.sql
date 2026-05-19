create extension if not exists pgcrypto;
create extension if not exists citext;

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  created_at timestamptz not null default timezone('utc', now()),
  constraint waitlist_email_format check (
    email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  )
);

alter table public.waitlist enable row level security;

grant usage on schema public to anon, authenticated;
grant insert on public.waitlist to anon, authenticated;

drop policy if exists "Anyone can join waitlist" on public.waitlist;

create policy "Anyone can join waitlist"
  on public.waitlist
  for insert
  to anon, authenticated
  with check (email is not null);
