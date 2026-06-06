create extension if not exists pgcrypto;

create table if not exists public.profile_boosts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  gold_cost integer not null,
  starts_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  constraint profile_boosts_gold_cost_check check (gold_cost > 0),
  constraint profile_boosts_status_check check (
    status in ('active', 'expired', 'cancelled')
  ),
  constraint profile_boosts_expiry_check check (expires_at > starts_at)
);

create index if not exists profile_boosts_user_status_expires_idx
  on public.profile_boosts (user_id, status, expires_at desc);

create index if not exists profile_boosts_status_expires_idx
  on public.profile_boosts (status, expires_at desc);

alter table public.wallet_transactions
  drop constraint if exists wallet_transactions_transaction_type_check;

alter table public.wallet_transactions
  add constraint wallet_transactions_transaction_type_check
  check (
    transaction_type in (
      'top_up',
      'gift_sent',
      'gift_received',
      'message_charge',
      'profile_boost',
      'adjustment'
    )
  );

alter table public.profile_boosts enable row level security;

grant usage on schema public to authenticated;
grant select on public.profile_boosts to authenticated;
revoke insert, update, delete on public.profile_boosts from authenticated;

drop policy if exists "Users can read their profile boosts" on public.profile_boosts;
drop policy if exists "Authenticated users can read active profile boosts" on public.profile_boosts;

create policy "Users can read their profile boosts"
  on public.profile_boosts
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Authenticated users can read active profile boosts"
  on public.profile_boosts
  for select
  to authenticated
  using (
    status = 'active'
    and expires_at > timezone('utc', now())
  );

create or replace function public.activate_profile_boost()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid := auth.uid();
  active_boost public.profile_boosts%rowtype;
  boost_cost integer;
  remaining_gold integer;
  saved_boost public.profile_boosts%rowtype;
begin
  if target_user_id is null then
    raise exception 'not_authenticated';
  end if;

  perform pg_advisory_xact_lock(hashtext(target_user_id::text));

  select *
  into active_boost
  from public.profile_boosts
  where user_id = target_user_id
    and status = 'active'
    and expires_at > timezone('utc', now())
  order by expires_at desc
  limit 1;

  if active_boost.id is not null then
    select coalesce(gold_balance, 0)
    into remaining_gold
    from public.user_wallets
    where user_id = target_user_id;

    return jsonb_build_object(
      'boost_id',
      active_boost.id,
      'expires_at',
      active_boost.expires_at,
      'gold_cost',
      active_boost.gold_cost,
      'remaining_gold',
      coalesce(remaining_gold, 0)
    );
  end if;

  select greatest(1, coalesce((value_json #>> '{}')::integer, 50))
  into boost_cost
  from public.economy_config
  where key = 'profile_boost_cost';

  boost_cost := coalesce(boost_cost, 50);

  update public.user_wallets
  set
    gold_balance = gold_balance - boost_cost,
    updated_at = timezone('utc', now())
  where user_id = target_user_id
    and gold_balance >= boost_cost
  returning gold_balance into remaining_gold;

  if remaining_gold is null then
    raise exception 'insufficient_gold';
  end if;

  insert into public.profile_boosts (
    user_id,
    gold_cost,
    starts_at,
    expires_at,
    status
  )
  values (
    target_user_id,
    boost_cost,
    timezone('utc', now()),
    timezone('utc', now()) + interval '24 hours',
    'active'
  )
  returning * into saved_boost;

  insert into public.wallet_transactions (
    user_id,
    transaction_type,
    gold_delta,
    reference_type,
    reference_id
  )
  values (
    target_user_id,
    'profile_boost',
    -boost_cost,
    'Profile boost',
    saved_boost.id
  );

  return jsonb_build_object(
    'boost_id',
    saved_boost.id,
    'expires_at',
    saved_boost.expires_at,
    'gold_cost',
    boost_cost,
    'remaining_gold',
    remaining_gold
  );
end;
$$;

revoke all on function public.activate_profile_boost() from public;
grant execute on function public.activate_profile_boost() to authenticated;
