create extension if not exists pgcrypto;

create table if not exists public.creator_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  diamonds_balance integer not null default 0 check (diamonds_balance >= 0),
  diamonds_lifetime integer not null default 0 check (diamonds_lifetime >= 0),
  diamonds_pending integer not null default 0 check (diamonds_pending >= 0),
  diamonds_withdrawn integer not null default 0 check (diamonds_withdrawn >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  diamonds_amount integer not null check (diamonds_amount > 0),
  cash_estimate numeric(12, 2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'paid')),
  payout_method text not null default 'manual',
  payout_details jsonb not null default '{}'::jsonb,
  admin_notes text,
  created_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz
);

create index if not exists withdrawal_requests_user_created_idx
  on public.withdrawal_requests (user_id, created_at desc);

create index if not exists withdrawal_requests_status_created_idx
  on public.withdrawal_requests (status, created_at desc);

insert into public.economy_config (key, value_json, description)
values
  ('diamond_conversion', '{"diamonds_per_usd":100}'::jsonb, 'Creator payout conversion. Default: 100 Diamonds = $1.00.'),
  ('creator_withdrawal_min_diamonds', '5000'::jsonb, 'Minimum creator withdrawal request amount in Diamonds.'),
  ('creator_split', '{"platform_percent":50,"receiver_percent":50}'::jsonb, 'Gift split between Matchr and creator receiver.')
on conflict (key) do update
set
  value_json = excluded.value_json,
  description = excluded.description,
  updated_at = timezone('utc', now());

alter table public.creator_wallets enable row level security;
alter table public.withdrawal_requests enable row level security;

grant usage on schema public to authenticated;
grant select on public.creator_wallets to authenticated;
grant select on public.withdrawal_requests to authenticated;

drop policy if exists "Users can read their creator wallet" on public.creator_wallets;
drop policy if exists "Users can read their withdrawal requests" on public.withdrawal_requests;

create policy "Users can read their creator wallet"
  on public.creator_wallets
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can read their withdrawal requests"
  on public.withdrawal_requests
  for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.get_diamonds_per_usd()
returns numeric
language sql
stable
set search_path = public
as $$
  select greatest(
    1,
    coalesce((value_json ->> 'diamonds_per_usd')::numeric, 100)
  )
  from public.economy_config
  where key = 'diamond_conversion';
$$;

create or replace function public.get_creator_receiver_percent()
returns numeric
language sql
stable
set search_path = public
as $$
  select least(
    100,
    greatest(0, coalesce((value_json ->> 'receiver_percent')::numeric, 50))
  )
  from public.economy_config
  where key = 'creator_split';
$$;

create or replace function public.credit_creator_diamonds_from_gift()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  receiver_percent numeric;
  diamonds_to_credit integer;
begin
  if new.receiver_id is null or coalesce(new.gold_cost, new.coin_price, 0) <= 0 then
    return new;
  end if;

  receiver_percent := public.get_creator_receiver_percent();
  diamonds_to_credit := floor(coalesce(new.gold_cost, new.coin_price, 0) * (receiver_percent / 100))::integer;

  if diamonds_to_credit <= 0 then
    return new;
  end if;

  insert into public.creator_wallets (
    user_id,
    diamonds_balance,
    diamonds_lifetime,
    updated_at
  )
  values (
    new.receiver_id,
    diamonds_to_credit,
    diamonds_to_credit,
    timezone('utc', now())
  )
  on conflict (user_id) do update
  set
    diamonds_balance = public.creator_wallets.diamonds_balance + excluded.diamonds_balance,
    diamonds_lifetime = public.creator_wallets.diamonds_lifetime + excluded.diamonds_lifetime,
    updated_at = timezone('utc', now());

  return new;
end;
$$;

drop trigger if exists credit_creator_diamonds_from_gift_trigger on public.gift_transactions;

create trigger credit_creator_diamonds_from_gift_trigger
  after insert on public.gift_transactions
  for each row
  execute function public.credit_creator_diamonds_from_gift();

create or replace function public.request_creator_withdrawal(
  requested_diamonds integer,
  requested_payout_method text,
  requested_payout_details jsonb default '{}'::jsonb
)
returns public.withdrawal_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  min_diamonds integer;
  diamonds_per_usd numeric;
  saved_request public.withdrawal_requests%rowtype;
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select greatest(1, coalesce((value_json #>> '{}')::integer, 5000))
  into min_diamonds
  from public.economy_config
  where key = 'creator_withdrawal_min_diamonds';

  diamonds_per_usd := public.get_diamonds_per_usd();

  if requested_diamonds < coalesce(min_diamonds, 5000) then
    raise exception 'minimum_withdrawal_not_met';
  end if;

  insert into public.creator_wallets (user_id)
  values (current_user_id)
  on conflict (user_id) do nothing;

  update public.creator_wallets
  set
    diamonds_balance = diamonds_balance - requested_diamonds,
    diamonds_pending = diamonds_pending + requested_diamonds,
    updated_at = timezone('utc', now())
  where user_id = current_user_id
    and diamonds_balance >= requested_diamonds;

  if not found then
    raise exception 'insufficient_diamonds';
  end if;

  insert into public.withdrawal_requests (
    user_id,
    diamonds_amount,
    cash_estimate,
    payout_method,
    payout_details
  )
  values (
    current_user_id,
    requested_diamonds,
    round((requested_diamonds / diamonds_per_usd)::numeric, 2),
    coalesce(nullif(requested_payout_method, ''), 'manual'),
    coalesce(requested_payout_details, '{}'::jsonb)
  )
  returning * into saved_request;

  return saved_request;
end;
$$;

revoke all on function public.request_creator_withdrawal(integer, text, jsonb) from public;
grant execute on function public.request_creator_withdrawal(integer, text, jsonb) to authenticated;
