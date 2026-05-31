create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists public_id text;

create unique index if not exists profiles_public_id_unique_idx
  on public.profiles (public_id)
  where public_id is not null;

create index if not exists profiles_public_id_search_idx
  on public.profiles (public_id);

create or replace function public.generate_matchr_public_id()
returns text
language plpgsql
as $$
declare
  candidate text;
begin
  loop
    candidate := 'M' || lpad(floor(random() * 100000000)::integer::text, 8, '0');

    if not exists (
      select 1
      from public.profiles
      where profiles.public_id = candidate
    ) then
      return candidate;
    end if;
  end loop;
end;
$$;

create or replace function public.set_profile_public_id()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.public_id is not null then
    new.public_id := old.public_id;
    return new;
  end if;

  if new.public_id is null or new.public_id !~ '^M[0-9]{8}$' then
    new.public_id := public.generate_matchr_public_id();
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_set_public_id on public.profiles;

create trigger profiles_set_public_id
  before insert or update on public.profiles
  for each row
  execute function public.set_profile_public_id();

do $$
declare
  profile_row record;
begin
  for profile_row in
    select id
    from public.profiles
    where public_id is null
  loop
    update public.profiles
    set public_id = public.generate_matchr_public_id()
    where id = profile_row.id;
  end loop;
end;
$$;

alter table public.profiles
  alter column public_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_public_id_format_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_public_id_format_check
      check (public_id ~ '^M[0-9]{8}$');
  end if;
end;
$$;

revoke update (public_id) on public.profiles from authenticated;
