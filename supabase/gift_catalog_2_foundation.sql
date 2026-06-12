create extension if not exists pgcrypto;

alter table public.gift_catalog
  add column if not exists rarity text not null default 'common',
  add column if not exists signature boolean not null default false,
  add column if not exists limited_until timestamptz,
  add column if not exists requires_elite_level integer;

alter table public.gift_catalog
  drop constraint if exists gift_catalog_rarity_check;

alter table public.gift_catalog
  add constraint gift_catalog_rarity_check
  check (rarity in ('common', 'select', 'rare', 'icon', 'signature'));

alter table public.gift_catalog
  drop constraint if exists gift_catalog_requires_elite_level_check;

alter table public.gift_catalog
  add constraint gift_catalog_requires_elite_level_check
  check (requires_elite_level is null or requires_elite_level > 0);

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
        'animation_key', animation_key,
        'category', category,
        'rarity', rarity,
        'signature', signature,
        'limited_until', limited_until,
        'requires_elite_level', requires_elite_level
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

create or replace function public.sync_gift_catalog_to_legacy_gifts_catalog()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.gifts_catalog (
    gift_type,
    name,
    icon,
    coin_price,
    active
  )
  select
    id,
    name,
    coalesce(nullif(icon_url, ''), 'matchr'),
    greatest(1, gold_cost),
    true
  from public.gift_catalog
  where active = true
  on conflict (gift_type) do update
  set
    name = excluded.name,
    coin_price = excluded.coin_price,
    active = true;

  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_gift_catalog_to_legacy_gifts_catalog_trigger on public.gift_catalog;

create trigger sync_gift_catalog_to_legacy_gifts_catalog_trigger
  after insert or update or delete on public.gift_catalog
  for each statement
  execute function public.sync_gift_catalog_to_legacy_gifts_catalog();

insert into public.gift_catalog (
  id,
  name,
  description,
  category,
  gold_cost,
  creator_percentage,
  animation_key,
  active,
  sort_order,
  rarity,
  signature
)
values
  ('signal_flare', 'Signal Flare', 'A clean first signal.', 'Signal', 10, 50, 'signal_flare', true, 10, 'common', false),
  ('rose_signal', 'Rose Signal', 'A classic attention signal.', 'Signal', 25, 50, 'rose_signal', true, 20, 'common', false),
  ('after_hours', 'After Hours', 'A private presence gift.', 'Presence', 50, 50, 'after_hours', true, 30, 'select', false),
  ('velvet_note', 'Velvet Note', 'A warmer private signal.', 'Presence', 75, 50, 'velvet_note', true, 40, 'select', false),
  ('spotlight', 'Spotlight', 'Support their visibility.', 'Creator Support', 100, 55, 'spotlight', true, 50, 'select', false),
  ('gold_signal', 'Gold Signal', 'A stronger creator support signal.', 'Creator Support', 250, 55, 'gold_signal', true, 60, 'rare', false),
  ('private_room', 'Private Room', 'A luxury attention object.', 'Luxury', 500, 60, 'private_room', true, 70, 'rare', false),
  ('black_card', 'Black Card', 'A high-status support object.', 'Luxury', 1000, 60, 'black_card', true, 80, 'icon', false),
  ('matchr_crown', 'Matchr Crown', 'A Matchr signature status gift.', 'Signature', 2500, 65, 'matchr_crown', true, 90, 'signature', true),
  ('midnight_invite', 'Midnight Invite', 'A top-tier private signal.', 'Signature', 5000, 70, 'midnight_invite', true, 100, 'signature', true)
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  gold_cost = excluded.gold_cost,
  creator_percentage = excluded.creator_percentage,
  animation_key = excluded.animation_key,
  active = true,
  sort_order = excluded.sort_order,
  rarity = excluded.rarity,
  signature = excluded.signature,
  updated_at = timezone('utc', now());

insert into public.gifts_catalog (
  gift_type,
  name,
  icon,
  coin_price,
  active
)
select
  id,
  name,
  coalesce(nullif(icon_url, ''), 'matchr'),
  greatest(1, gold_cost),
  true
from public.gift_catalog
where active = true
on conflict (gift_type) do update
set
  name = excluded.name,
  coin_price = excluded.coin_price,
  active = true;

insert into public.economy_config (key, value_json, value, description)
select
  'gift_catalog',
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name,
        'price', gold_cost,
        'creator_percentage', creator_percentage,
        'icon', icon_url,
        'animation_key', animation_key,
        'category', category,
        'rarity', rarity,
        'signature', signature,
        'limited_until', limited_until,
        'requires_elite_level', requires_elite_level
      )
      order by sort_order, name
    ),
    '[]'::jsonb
  ),
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name,
        'price', gold_cost,
        'creator_percentage', creator_percentage,
        'icon', icon_url,
        'animation_key', animation_key,
        'category', category,
        'rarity', rarity,
        'signature', signature,
        'limited_until', limited_until,
        'requires_elite_level', requires_elite_level
      )
      order by sort_order, name
    ),
    '[]'::jsonb
  ),
  'Gift catalog rendered by chat, stories, moments, and transaction logic.'
from public.gift_catalog
where active = true
on conflict (key) do update
set
  value_json = excluded.value_json,
  value = excluded.value,
  description = excluded.description,
  updated_at = timezone('utc', now());
