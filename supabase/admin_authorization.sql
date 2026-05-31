create table if not exists public.admin_users (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.admin_users enable row level security;

grant select on public.admin_users to authenticated;

drop policy if exists "Admins can read admin users" on public.admin_users;
drop policy if exists "Users can read their admin membership" on public.admin_users;

create policy "Users can read their admin membership"
  on public.admin_users
  for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.is_admin(check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where admin_users.user_id = check_user_id
  );
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated;
