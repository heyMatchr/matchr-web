alter table public.premium_subscriptions
  add column if not exists payment_order_id uuid references public.payment_orders(id) on delete set null,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create index if not exists premium_subscriptions_payment_order_idx
  on public.premium_subscriptions (payment_order_id)
  where payment_order_id is not null;

create or replace function public.activate_premium_after_payment(target_order_id uuid)
returns public.premium_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  target_order public.payment_orders%rowtype;
  active_subscription public.premium_subscriptions%rowtype;
  saved_subscription public.premium_subscriptions%rowtype;
  plan_id_text text;
  plan_name_from_plan text;
  plan_legacy_name text;
  plan_interval text;
  plan_duration_days integer;
  plan_price_usd numeric;
  plan_name_value text;
  interval_value text;
  duration_days_value integer;
  price_usd_value numeric;
  starts_at timestamptz;
  next_expires_at timestamptz;
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

  if target_order.order_type <> 'premium_subscription' then
    return null;
  end if;

  if target_order.metadata ? 'premium_activated_at' then
    select *
    into saved_subscription
    from public.premium_subscriptions
    where payment_order_id = target_order.id
    limit 1;

    return saved_subscription;
  end if;

  plan_id_text := target_order.metadata ->> 'plan_id';

  if plan_id_text is not null and plan_id_text <> '' then
    select name, plan_name, duration_days, interval, price_usd
    into plan_name_from_plan, plan_legacy_name, plan_duration_days, plan_interval, plan_price_usd
    from public.premium_plans
    where id::text = plan_id_text
    limit 1;
  end if;

  plan_name_value := coalesce(
    plan_name_from_plan,
    plan_legacy_name,
    target_order.metadata ->> 'plan_name',
    target_order.plan_name,
    'Matchr Premium'
  );
  duration_days_value := greatest(
    1,
    coalesce(
      plan_duration_days,
      nullif(target_order.metadata ->> 'duration_days', '')::integer,
      case
        when lower(coalesce(plan_interval, '')) = 'month' then 30
        when lower(coalesce(plan_interval, '')) = 'year' then 365
        else 7
      end
    )
  );
  interval_value := coalesce(
    plan_interval,
    case
      when duration_days_value >= 365 then 'year'
      when duration_days_value >= 28 then 'month'
      else 'week'
    end
  );
  price_usd_value := coalesce(
    plan_price_usd,
    target_order.amount_usd,
    target_order.amount,
    0
  );

  select *
  into active_subscription
  from public.premium_subscriptions
  where user_id = target_order.user_id
    and status = 'active'
    and (expires_at is null or expires_at > timezone('utc', now()))
  order by expires_at desc nulls last, created_at desc
  limit 1
  for update;

  starts_at := greatest(
    timezone('utc', now()),
    coalesce(active_subscription.expires_at, timezone('utc', now()))
  );
  next_expires_at := starts_at + make_interval(days => duration_days_value);

  if active_subscription.id is not null then
    update public.premium_subscriptions
    set
      plan_name = plan_name_value,
      status = 'active',
      price_usd = price_usd_value,
      interval = interval_value,
      expires_at = next_expires_at,
      payment_order_id = target_order.id,
      updated_at = timezone('utc', now())
    where id = active_subscription.id
    returning * into saved_subscription;
  else
    insert into public.premium_subscriptions (
      user_id,
      plan_name,
      status,
      price_usd,
      interval,
      expires_at,
      payment_order_id
    )
    values (
      target_order.user_id,
      plan_name_value,
      'active',
      price_usd_value,
      interval_value,
      next_expires_at,
      target_order.id
    )
    returning * into saved_subscription;
  end if;

  update public.payment_orders
  set
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'premium_activated_at',
      timezone('utc', now()),
      'premium_expires_at',
      saved_subscription.expires_at,
      'premium_subscription_id',
      saved_subscription.id
    ),
    updated_at = timezone('utc', now())
  where id = target_order.id;

  update public.profiles
  set premium = true
  where id = target_order.user_id;

  return saved_subscription;
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
  perform public.activate_premium_after_payment(saved_order.id);

  return saved_order;
end;
$$;

revoke all on function public.activate_premium_after_payment(uuid) from public;
revoke all on function public.mark_payment_paid(uuid) from public;
grant execute on function public.activate_premium_after_payment(uuid) to service_role;
grant execute on function public.mark_payment_paid(uuid) to service_role;
