create extension if not exists pgcrypto;

-- gift_transactions.gift_type still references the legacy gifts_catalog table.
-- Keep that FK valid while the app reads gifts from the newer gift_catalog table.
with managed_gifts as (
  select
    id as gift_type,
    name,
    coalesce(
      nullif(icon_url, ''),
      case id
        when 'rose' then '🌹'
        when 'kiss' then '💋'
        when 'heart_box' then '💝'
        when 'teddy' then '🧸'
        when 'wine' then '🍷'
        when 'private_jet' then '✈️'
        when 'diamond_ring' then '💍'
        when 'matchr_crown' then '👑'
        when 'diamond' then '💎'
        when 'crown' then '👑'
        else '✦'
      end
    ) as icon,
    greatest(1, gold_cost) as coin_price,
    active
  from public.gift_catalog
),
fallback_gifts as (
  select *
  from (
    values
      ('rose', 'Rose', '🌹', 5, true),
      ('kiss', 'Kiss', '💋', 8, true),
      ('heart_box', 'Heart Box', '💝', 10, true),
      ('teddy', 'Teddy', '🧸', 20, true),
      ('wine', 'Wine', '🍷', 30, true),
      ('private_jet', 'Private Jet', '✈️', 80, true),
      ('diamond_ring', 'Diamond Ring', '💍', 120, true),
      ('matchr_crown', 'Matchr Crown', '👑', 150, true)
  ) as fallback(gift_type, name, icon, coin_price, active)
  where not exists (select 1 from public.gift_catalog)
),
sync_gifts as (
  select * from managed_gifts
  union all
  select * from fallback_gifts
)
insert into public.gifts_catalog (
  gift_type,
  name,
  icon,
  coin_price,
  active
)
select
  gift_type,
  name,
  icon,
  coin_price,
  active
from sync_gifts
on conflict (gift_type) do nothing;
