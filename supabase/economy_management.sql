create extension if not exists pgcrypto;

alter table public.gold_packages
  add column if not exists usd_price numeric(8, 2),
  add column if not exists bonus_gold integer not null default 0,
  add column if not exists active boolean not null default true,
  add column if not exists sort_order integer not null default 0,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

update public.gold_packages
set usd_price = coalesce(usd_price, price_usd)
where usd_price is null;

alter table public.gold_packages
  alter column usd_price set not null;

create table if not exists public.gift_catalog (
  id text primary key,
  name text not null,
  description text not null default '',
  category text not null default 'classic',
  gold_cost integer not null check (gold_cost > 0),
  creator_percentage numeric(5, 2) not null default 50,
  animation_key text,
  icon_url text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.premium_plans
  add column if not exists name text,
  add column if not exists duration_days integer,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

update public.premium_plans
set
  name = coalesce(name, plan_name),
  duration_days = coalesce(
    duration_days,
    case
      when lower(interval) in ('week', 'weekly') then 7
      when lower(interval) in ('month', 'monthly') then 30
      when lower(interval) in ('year', 'yearly', 'annual') then 365
      else 7
    end
  )
where name is null
  or duration_days is null;

alter table public.premium_plans
  alter column name set not null,
  alter column duration_days set not null;

create table if not exists public.elite_levels (
  level integer primary key,
  monthly_gold_requirement integer not null default 0,
  badge text not null default '',
  benefits_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.creator_tiers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  creator_percentage numeric(5, 2) not null default 50,
  requirements_json jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.economy_config
  add column if not exists value jsonb;

update public.economy_config
set value = coalesce(value, value_json)
where value is null;

alter table public.economy_config
  alter column value set not null;

insert into public.gift_catalog (
  id,
  name,
  description,
  category,
  gold_cost,
  creator_percentage,
  animation_key,
  sort_order
)
select
  gift ->> 'id',
  coalesce(gift ->> 'name', gift ->> 'id'),
  '',
  'classic',
  greatest(1, coalesce((gift ->> 'price')::integer, 1)),
  coalesce((gift ->> 'creator_percentage')::numeric, 50),
  gift ->> 'animation_key',
  (row_number() over ())::integer
from public.economy_config,
  jsonb_array_elements(coalesce(value_json, '[]'::jsonb)) as gift
where key = 'gift_catalog'
  and gift ? 'id'
on conflict (id) do update
set
  name = excluded.name,
  gold_cost = excluded.gold_cost,
  creator_percentage = excluded.creator_percentage,
  updated_at = timezone('utc', now());

insert into public.elite_levels (
  level,
  monthly_gold_requirement,
  badge,
  benefits_json
)
values
  (1, 1000, 'Rising', '{"boost":"light","badge":true}'::jsonb),
  (2, 5000, 'Elite', '{"boost":"medium","priority_support":true}'::jsonb),
  (3, 15000, 'Icon', '{"boost":"high","creator_tools":true}'::jsonb)
on conflict (level) do nothing;

insert into public.creator_tiers (
  name,
  creator_percentage,
  requirements_json,
  sort_order
)
values
  ('Standard', 50, '{"minimum_followers":0}'::jsonb, 1),
  ('Verified', 60, '{"verified":true}'::jsonb, 2),
  ('Elite', 70, '{"elite_level":2}'::jsonb, 3)
on conflict (name) do nothing;

insert into public.economy_config (key, value_json, value, description)
values
  ('diamond_conversion_rate', '100'::jsonb, '100'::jsonb, 'Diamonds required for $1.00 cash estimate.'),
  ('minimum_withdrawal', '5000'::jsonb, '5000'::jsonb, 'Minimum Diamonds required before withdrawal.'),
  ('priority_message_cost', '15'::jsonb, '15'::jsonb, 'Gold cost for future priority message feature.'),
  ('profile_boost_cost', '50'::jsonb, '50'::jsonb, 'Gold cost for future profile boost feature.')
on conflict (key) do update
set
  value_json = excluded.value_json,
  value = excluded.value,
  description = excluded.description,
  updated_at = timezone('utc', now());

create or replace function public.sync_gold_package_prices()
returns trigger
language plpgsql
as $$
begin
  new.price_usd := coalesce(new.price_usd, new.usd_price);
  new.usd_price := coalesce(new.usd_price, new.price_usd);
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists sync_gold_package_prices_trigger on public.gold_packages;

create trigger sync_gold_package_prices_trigger
  before insert or update on public.gold_packages
  for each row
  execute function public.sync_gold_package_prices();

create or replace function public.sync_premium_plan_names()
returns trigger
language plpgsql
as $$
begin
  new.plan_name := coalesce(new.plan_name, new.name);
  new.name := coalesce(new.name, new.plan_name);
  new.interval := coalesce(
    new.interval,
    case
      when new.duration_days <= 7 then 'week'
      when new.duration_days <= 31 then 'month'
      else 'year'
    end
  );
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists sync_premium_plan_names_trigger on public.premium_plans;

create trigger sync_premium_plan_names_trigger
  before insert or update on public.premium_plans
  for each row
  execute function public.sync_premium_plan_names();

create or replace function public.sync_economy_config_values()
returns trigger
language plpgsql
as $$
begin
  new.value_json := coalesce(new.value_json, new.value);
  new.value := coalesce(new.value, new.value_json);
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists sync_economy_config_values_trigger on public.economy_config;

create trigger sync_economy_config_values_trigger
  before insert or update on public.economy_config
  for each row
  execute function public.sync_economy_config_values();

create or replace function public.sync_gift_catalog_to_economy_config()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  catalog jsonb;
begin
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name,
        'price', gold_cost,
        'creator_percentage', creator_percentage,
        'icon', icon_url,
        'animation_key', animation_key
      )
      order by sort_order, name
    ),
    '[]'::jsonb
  )
  into catalog
  from public.gift_catalog
  where active = true;

  insert into public.economy_config (key, value_json, value, description)
  values (
    'gift_catalog',
    catalog,
    catalog,
    'Gift catalog rendered by chat, stories, moments, and transaction logic.'
  )
  on conflict (key) do update
  set
    value_json = excluded.value_json,
    value = excluded.value,
    description = excluded.description,
    updated_at = timezone('utc', now());

  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_gift_catalog_to_economy_config_trigger on public.gift_catalog;

create trigger sync_gift_catalog_to_economy_config_trigger
  after insert or update or delete on public.gift_catalog
  for each row
  execute function public.sync_gift_catalog_to_economy_config();

alter table public.gift_catalog enable row level security;
alter table public.elite_levels enable row level security;
alter table public.creator_tiers enable row level security;

grant usage on schema public to authenticated;
grant select on public.gold_packages to authenticated;
grant select on public.gift_catalog to authenticated;
grant select on public.premium_plans to authenticated;
grant select on public.elite_levels to authenticated;
grant select on public.creator_tiers to authenticated;
grant select on public.economy_config to authenticated;

revoke insert, update, delete on public.gold_packages from authenticated;
revoke insert, update, delete on public.gift_catalog from authenticated;
revoke insert, update, delete on public.premium_plans from authenticated;
revoke insert, update, delete on public.elite_levels from authenticated;
revoke insert, update, delete on public.creator_tiers from authenticated;
revoke insert, update, delete on public.economy_config from authenticated;

drop policy if exists "Authenticated users can read managed gift catalog" on public.gift_catalog;
drop policy if exists "Authenticated users can read elite levels" on public.elite_levels;
drop policy if exists "Authenticated users can read creator tiers" on public.creator_tiers;

create policy "Authenticated users can read managed gift catalog"
  on public.gift_catalog
  for select
  to authenticated
  using (active = true);

create policy "Authenticated users can read elite levels"
  on public.elite_levels
  for select
  to authenticated
  using (true);

create policy "Authenticated users can read creator tiers"
  on public.creator_tiers
  for select
  to authenticated
  using (active = true);
