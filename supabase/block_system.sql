create extension if not exists pgcrypto;

create table if not exists public.blocked_users (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid references auth.users(id) on delete cascade,
  blocked_user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint blocked_users_no_self check (
    blocker_id <> coalesce(blocked_id, blocked_user_id)
  )
);

alter table public.blocked_users
  add column if not exists blocked_id uuid references auth.users(id) on delete cascade,
  add column if not exists blocked_user_id uuid references auth.users(id) on delete cascade;

update public.blocked_users
set blocked_id = blocked_user_id
where blocked_id is null
  and blocked_user_id is not null;

update public.blocked_users
set blocked_user_id = blocked_id
where blocked_user_id is null
  and blocked_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'blocked_users_unique_blocked_id_pair'
      and conrelid = 'public.blocked_users'::regclass
  ) then
    alter table public.blocked_users
      add constraint blocked_users_unique_blocked_id_pair unique (blocker_id, blocked_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'blocked_users_unique_blocked_user_pair'
      and conrelid = 'public.blocked_users'::regclass
  ) then
    alter table public.blocked_users
      add constraint blocked_users_unique_blocked_user_pair unique (blocker_id, blocked_user_id);
  end if;
end;
$$;

create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint blocks_no_self check (blocker_id <> blocked_user_id),
  constraint blocks_unique_user_pair unique (blocker_id, blocked_user_id)
);

alter table public.blocks enable row level security;
alter table public.blocked_users enable row level security;

grant usage on schema public to authenticated;
grant select, insert, delete on public.blocks to authenticated;
grant select, insert, delete on public.blocked_users to authenticated;

drop policy if exists "Users can create their blocks" on public.blocks;
drop policy if exists "Users can read their blocks" on public.blocks;
drop policy if exists "Users can delete their blocks" on public.blocks;
drop policy if exists "Users can read their blocked users" on public.blocked_users;
drop policy if exists "Users can create their blocked users" on public.blocked_users;
drop policy if exists "Users can delete their blocked users" on public.blocked_users;

create policy "Users can create their blocks"
  on public.blocks for insert to authenticated
  with check (auth.uid() = blocker_id and blocker_id <> blocked_user_id);

create policy "Users can read their blocks"
  on public.blocks for select to authenticated
  using (auth.uid() = blocker_id or auth.uid() = blocked_user_id);

create policy "Users can delete their blocks"
  on public.blocks for delete to authenticated
  using (auth.uid() = blocker_id);

create policy "Users can read their blocked users"
  on public.blocked_users for select to authenticated
  using (
    auth.uid() = blocker_id
    or auth.uid() = coalesce(blocked_id, blocked_user_id)
  );

create policy "Users can create their blocked users"
  on public.blocked_users for insert to authenticated
  with check (
    auth.uid() = blocker_id
    and blocker_id <> coalesce(blocked_id, blocked_user_id)
  );

create policy "Users can delete their blocked users"
  on public.blocked_users for delete to authenticated
  using (auth.uid() = blocker_id);

create or replace function public.sync_blocked_users_ids()
returns trigger
language plpgsql
as $$
begin
  if new.blocked_id is null then
    new.blocked_id := new.blocked_user_id;
  end if;

  if new.blocked_user_id is null then
    new.blocked_user_id := new.blocked_id;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_blocked_users_ids_trigger on public.blocked_users;

create trigger sync_blocked_users_ids_trigger
  before insert or update on public.blocked_users
  for each row
  execute function public.sync_blocked_users_ids();

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
  )
  or exists (
    select 1
    from public.blocked_users
    where (
      blocked_users.blocker_id = first_user_id
      and coalesce(blocked_users.blocked_id, blocked_users.blocked_user_id) = second_user_id
    )
    or (
      blocked_users.blocker_id = second_user_id
      and coalesce(blocked_users.blocked_id, blocked_users.blocked_user_id) = first_user_id
    )
  );
$$;

revoke all on function public.users_are_blocked(uuid, uuid) from public;
grant execute on function public.users_are_blocked(uuid, uuid) to authenticated;
