-- Keeps runtime economy calculations connected to admin-managed tables.

create or replace function public.get_diamonds_per_usd()
returns numeric
language sql
stable
set search_path = public
as $$
  select greatest(
    1,
    coalesce((value_json #>> '{}')::numeric, (value #>> '{}')::numeric, 100)
  )
  from public.economy_config
  where key = 'diamond_conversion_rate';
$$;

create or replace function public.get_creator_receiver_percent(target_user_id uuid default null)
returns numeric
language plpgsql
stable
set search_path = public
as $$
declare
  tier_percent numeric;
  split_percent numeric;
begin
  -- MVP tier resolution uses the Standard active tier. This keeps the payout
  -- percentage admin-managed now, while leaving room for per-user tiers later.
  select creator_percentage
  into tier_percent
  from public.creator_tiers
  where active = true
  order by
    case when lower(name) = 'standard' then 0 else 1 end,
    sort_order,
    creator_percentage
  limit 1;

  if tier_percent is not null then
    return least(100, greatest(0, tier_percent));
  end if;

  select coalesce((value_json ->> 'receiver_percent')::numeric, 50)
  into split_percent
  from public.economy_config
  where key = 'creator_split';

  return least(100, greatest(0, coalesce(split_percent, 50)));
end;
$$;

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

  select greatest(
    1,
    coalesce((value_json #>> '{}')::integer, (value #>> '{}')::integer, 5000)
  )
  into min_diamonds
  from public.economy_config
  where key = 'minimum_withdrawal';

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

revoke all on function public.get_diamonds_per_usd() from public;
revoke all on function public.get_creator_receiver_percent(uuid) from public;
revoke all on function public.request_creator_withdrawal(integer, text, jsonb) from public;
grant execute on function public.request_creator_withdrawal(integer, text, jsonb) to authenticated;
