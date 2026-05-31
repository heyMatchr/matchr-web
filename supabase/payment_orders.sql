create extension if not exists pgcrypto;

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'manual',
  order_type text not null default 'gold_purchase',
  status text not null default 'pending',
  amount numeric(12, 2),
  amount_usd numeric(12, 2),
  currency text not null default 'USD',
  gold_amount integer,
  plan_name text,
  stripe_checkout_session_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  paid_at timestamptz
);

alter table public.payment_orders
  add column if not exists provider text not null default 'manual',
  add column if not exists amount numeric(12, 2),
  add column if not exists currency text not null default 'USD',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists paid_at timestamptz;

alter table public.payment_orders
  drop constraint if exists payment_orders_order_type_check,
  drop constraint if exists payment_orders_status_check;

update public.payment_orders
set
  order_type = case
    when order_type = 'gold' then 'gold_purchase'
    when order_type = 'premium' then 'premium_subscription'
    else order_type
  end,
  status = case
    when status = 'checkout_placeholder' then 'pending'
    else status
  end,
  amount = coalesce(amount, amount_usd)
where order_type in ('gold', 'premium')
  or status = 'checkout_placeholder'
  or amount is null;

alter table public.payment_orders
  add constraint payment_orders_order_type_check
  check (order_type in ('gold_purchase', 'premium_subscription', 'gift_purchase')),
  add constraint payment_orders_status_check
  check (status in ('pending', 'paid', 'failed', 'cancelled'));

create index if not exists payment_orders_user_created_idx
  on public.payment_orders (user_id, created_at desc);

create index if not exists payment_orders_status_created_idx
  on public.payment_orders (status, created_at desc);

alter table public.payment_orders enable row level security;

grant usage on schema public to authenticated;
grant select, insert on public.payment_orders to authenticated;

revoke update, delete on public.payment_orders from authenticated;

drop policy if exists "Users can read their payment orders" on public.payment_orders;
drop policy if exists "Users can create their payment orders" on public.payment_orders;

create policy "Users can read their payment orders"
  on public.payment_orders
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can create their payment orders"
  on public.payment_orders
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and order_type in ('gold_purchase', 'premium_subscription', 'gift_purchase')
  );

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

  insert into public.payment_orders (
    user_id,
    provider,
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
    coalesce(nullif(selected_provider, ''), 'manual'),
    selected_order_type,
    'pending',
    selected_amount,
    case when upper(coalesce(selected_currency, 'USD')) = 'USD' then selected_amount else null end,
    upper(coalesce(selected_currency, 'USD')),
    selected_gold_amount,
    coalesce(selected_metadata, '{}'::jsonb)
  )
  returning * into saved_order;

  return saved_order;
end;
$$;

create or replace function public.credit_gold_after_payment(target_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order public.payment_orders%rowtype;
begin
  select *
  into target_order
  from public.payment_orders
  where id = target_order_id
  for update;

  if target_order.id is null then
    raise exception 'order_not_found';
  end if;

  if target_order.status <> 'paid' then
    raise exception 'payment_not_paid';
  end if;

  if target_order.order_type <> 'gold_purchase' or coalesce(target_order.gold_amount, 0) <= 0 then
    return 0;
  end if;

  if exists (
    select 1
    from public.wallet_transactions
    where reference_type = 'payment_order'
      and reference_id = target_order.id
  ) then
    return 0;
  end if;

  insert into public.user_wallets (user_id, gold_balance)
  values (target_order.user_id, target_order.gold_amount)
  on conflict (user_id) do update
  set
    gold_balance = public.user_wallets.gold_balance + excluded.gold_balance,
    updated_at = timezone('utc', now());

  insert into public.wallet_transactions (
    user_id,
    transaction_type,
    gold_delta,
    reference_type,
    reference_id
  )
  values (
    target_order.user_id,
    'top_up',
    target_order.gold_amount,
    'payment_order',
    target_order.id
  );

  return target_order.gold_amount;
end;
$$;

create or replace function public.mark_payment_paid(target_order_id uuid)
returns public.payment_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_order public.payment_orders%rowtype;
begin
  update public.payment_orders
  set
    status = 'paid',
    paid_at = coalesce(paid_at, timezone('utc', now())),
    updated_at = timezone('utc', now())
  where id = target_order_id
    and status = 'pending'
  returning * into saved_order;

  if saved_order.id is null then
    raise exception 'order_not_pending';
  end if;

  perform public.credit_gold_after_payment(saved_order.id);

  return saved_order;
end;
$$;

create or replace function public.mark_payment_failed(
  target_order_id uuid,
  failure_metadata jsonb default '{}'::jsonb
)
returns public.payment_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_order public.payment_orders%rowtype;
begin
  update public.payment_orders
  set
    status = 'failed',
    metadata = coalesce(metadata, '{}'::jsonb) || coalesce(failure_metadata, '{}'::jsonb),
    updated_at = timezone('utc', now())
  where id = target_order_id
    and status = 'pending'
  returning * into saved_order;

  if saved_order.id is null then
    raise exception 'order_not_pending';
  end if;

  return saved_order;
end;
$$;

revoke all on function public.create_payment_order(text, text, numeric, text, integer, jsonb) from public;
revoke all on function public.mark_payment_paid(uuid) from public;
revoke all on function public.mark_payment_failed(uuid, jsonb) from public;
revoke all on function public.credit_gold_after_payment(uuid) from public;

grant execute on function public.create_payment_order(text, text, numeric, text, integer, jsonb) to authenticated;
grant execute on function public.mark_payment_paid(uuid) to service_role;
grant execute on function public.mark_payment_failed(uuid, jsonb) to service_role;
grant execute on function public.credit_gold_after_payment(uuid) to service_role;
