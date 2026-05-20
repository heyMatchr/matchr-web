create extension if not exists pgcrypto;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(trim(reason)) > 0),
  details text not null default '' check (char_length(details) <= 1000),
  status text not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  constraint reports_no_self check (reporter_id <> reported_user_id)
);

create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint blocks_no_self check (blocker_id <> blocked_user_id),
  constraint blocks_unique_user_pair unique (blocker_id, blocked_user_id)
);

alter table public.reports enable row level security;
alter table public.blocks enable row level security;

grant usage on schema public to authenticated;
grant select, insert on public.reports to authenticated;
grant select, insert on public.blocks to authenticated;

drop policy if exists "Users can create reports" on public.reports;
drop policy if exists "Users can read their reports" on public.reports;
drop policy if exists "Users can create their blocks" on public.blocks;
drop policy if exists "Users can read their blocks" on public.blocks;

create policy "Users can create reports"
  on public.reports
  for insert
  to authenticated
  with check (
    auth.uid() = reporter_id
    and reporter_id <> reported_user_id
  );

create policy "Users can read their reports"
  on public.reports
  for select
  to authenticated
  using (auth.uid() = reporter_id);

create policy "Users can create their blocks"
  on public.blocks
  for insert
  to authenticated
  with check (
    auth.uid() = blocker_id
    and blocker_id <> blocked_user_id
  );

create policy "Users can read their blocks"
  on public.blocks
  for select
  to authenticated
  using (auth.uid() = blocker_id);

create or replace function public.users_are_blocked(
  first_user_id uuid,
  second_user_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.blocks
    where (
      blocks.blocker_id = first_user_id
      and blocks.blocked_user_id = second_user_id
    )
    or (
      blocks.blocker_id = second_user_id
      and blocks.blocked_user_id = first_user_id
    )
  );
$$;

revoke all on function public.users_are_blocked(uuid, uuid) from public;
grant execute on function public.users_are_blocked(uuid, uuid) to authenticated;

drop policy if exists "Users can send match messages" on public.messages;

create policy "Users can send match messages"
  on public.messages
  for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and sender_id <> receiver_id
    and exists (
      select 1
      from public.matches
      where matches.id = messages.match_id
        and (
          matches.user_one_id = auth.uid()
          or matches.user_two_id = auth.uid()
        )
        and (
          messages.receiver_id = matches.user_one_id
          or messages.receiver_id = matches.user_two_id
        )
        and messages.receiver_id <> auth.uid()
    )
    and not public.users_are_blocked(messages.sender_id, messages.receiver_id)
  );
