create extension if not exists pgcrypto;

create table if not exists public.payment_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  provider_key text not null unique,
  active boolean not null default true,
  supported_countries text[] not null default array['GLOBAL']::text[],
  supported_currencies text[] not null default array['USD']::text[],
  priority integer not null default 100,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.payment_orders
  add column if not exists provider_key text;

update public.payment_orders
set provider_key = coalesce(provider_key, provider)
where provider_key is null;

alter table public.payment_orders
  alter column provider_key set default 'manual',
  alter column provider_key set not null;

insert into public.payment_providers (
  name,
  provider_key,
  active,
  supported_countries,
  supported_currencies,
  priority
)
values
  ('Paystack', 'paystack', true, array['NG', 'Nigeria'], array['NGN', 'USD'], 10),
  ('Flutterwave', 'flutterwave', true, array['NG', 'Nigeria', 'GH', 'Ghana', 'KE', 'Kenya', 'ZA', 'South Africa'], array['NGN', 'GHS', 'KES', 'ZAR', 'USD'], 20),
  ('Stripe', 'stripe', true, array['US', 'United States', 'CA', 'Canada', 'GB', 'United Kingdom', 'EU'], array['USD', 'CAD', 'GBP', 'EUR'], 30),
  ('Apple Pay', 'apple_pay', true, array['US', 'United States', 'CA', 'Canada', 'GB', 'United Kingdom', 'EU'], array['USD', 'CAD', 'GBP', 'EUR'], 35),
  ('USDT', 'usdt', true, array['GLOBAL'], array['USD', 'USDT'], 90),
  ('Manual Placeholder', 'manual', false, array['GLOBAL'], array['USD'], 999)
on conflict (provider_key) do update
set
  name = excluded.name,
  supported_countries = excluded.supported_countries,
  supported_currencies = excluded.supported_currencies,
  priority = excluded.priority;

create index if not exists payment_providers_active_priority_idx
  on public.payment_providers (active, priority, provider_key);

create index if not exists payment_orders_provider_key_created_idx
  on public.payment_orders (provider_key, created_at desc);

create or replace function public.sync_payment_order_provider_key()
returns trigger
language plpgsql
as $$
begin
  new.provider_key := coalesce(nullif(new.provider_key, ''), nullif(new.provider, ''), 'manual');
  new.provider := new.provider_key;
  return new;
end;
$$;

drop trigger if exists sync_payment_order_provider_key_trigger on public.payment_orders;

create trigger sync_payment_order_provider_key_trigger
  before insert or update on public.payment_orders
  for each row
  execute function public.sync_payment_order_provider_key();

create or replace function public.create_payment_order(
  selected_provider text,
  selected_order_type text,
  selected_amount numeric,
  selected_currency text default 'USD',
  selected_gold_amount integer default null,
  selected_metadata jsonb default '{}'::jsonb
)
returns public.payment_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_provider text := coalesce(nullif(selected_provider, ''), 'manual');
  normalized_currency text := upper(coalesce(selected_currency, 'USD'));
  saved_order public.payment_orders%rowtype;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if selected_order_type not in ('gold_purchase', 'premium_subscription', 'gift_purchase') then
    raise exception 'invalid_order_type';
  end if;

  if selected_amount is null or selected_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  if not exists (
    select 1
    from public.payment_providers
    where provider_key = normalized_provider
      and active = true
      and (
        cardinality(supported_currencies) = 0
        or normalized_currency = any(supported_currencies)
        or 'USD' = any(supported_currencies)
      )
  ) then
    raise exception 'invalid_payment_provider';
  end if;

  insert into public.payment_orders (
    user_id,
    provider,
    provider_key,
    order_type,
    status,
    amount,
    amount_usd,
    currency,
    gold_amount,
    metadata
  )
  values (
    current_user_id,
    normalized_provider,
    normalized_provider,
    selected_order_type,
    'pending',
    selected_amount,
    case when normalized_currency = 'USD' then selected_amount else null end,
    normalized_currency,
    selected_gold_amount,
    coalesce(selected_metadata, '{}'::jsonb)
  )
  returning * into saved_order;

  return saved_order;
end;
$$;

alter table public.payment_providers enable row level security;

grant usage on schema public to authenticated;
grant select on public.payment_providers to authenticated;
revoke insert, update, delete on public.payment_providers from authenticated;

drop policy if exists "Authenticated users can read active payment providers" on public.payment_providers;

create policy "Authenticated users can read active payment providers"
  on public.payment_providers
  for select
  to authenticated
  using (active = true);

revoke all on function public.create_payment_order(text, text, numeric, text, integer, jsonb) from public;
grant execute on function public.create_payment_order(text, text, numeric, text, integer, jsonb) to authenticated;
