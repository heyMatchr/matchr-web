create or replace function public.record_social_gift_with_economy(
  receiver_user_id uuid,
  selected_gift_type text,
  gift_source text,
  source_uuid uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_user_id uuid := auth.uid();
  gift_catalog jsonb;
  selected_gift jsonb;
  gift_price integer;
  next_sender_balance integer;
  saved_gift_transaction_id uuid;
  saved_activity_row_id uuid;
begin
  if sender_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if sender_user_id = receiver_user_id or gift_source not in ('story', 'moment') then
    raise exception 'invalid_gift';
  end if;

  if public.users_are_blocked(sender_user_id, receiver_user_id) then
    raise exception 'blocked';
  end if;

  if gift_source = 'moment' and not exists (
    select 1
    from public.moments
    where id = source_uuid
      and user_id = receiver_user_id
      and not public.users_are_blocked(sender_user_id, receiver_user_id)
  ) then
    raise exception 'invalid_source';
  end if;

  if gift_source = 'story' and not exists (
    select 1
    from public.stories
    where id = source_uuid
      and user_id = receiver_user_id
      and expires_at > timezone('utc', now())
      and not public.users_are_blocked(sender_user_id, receiver_user_id)
  ) then
    raise exception 'invalid_source';
  end if;

  select coalesce(value_json, '[]'::jsonb)
  into gift_catalog
  from public.economy_config
  where key = 'gift_catalog';

  select gift
  into selected_gift
  from jsonb_array_elements(coalesce(gift_catalog, '[]'::jsonb)) as gift
  where gift ->> 'id' = selected_gift_type
  limit 1;

  if selected_gift is null then
    raise exception 'invalid_gift';
  end if;

  gift_price := greatest(0, coalesce((selected_gift ->> 'price')::integer, 0));

  if gift_price <= 0 then
    raise exception 'invalid_gift';
  end if;

  update public.user_wallets
  set
    gold_balance = gold_balance - gift_price,
    updated_at = timezone('utc', now())
  where user_id = sender_user_id
    and gold_balance >= gift_price
  returning gold_balance into next_sender_balance;

  if next_sender_balance is null then
    raise exception 'insufficient_gold';
  end if;

  insert into public.gift_transactions (
    gift_type,
    coin_price,
    gold_cost,
    receiver_id,
    sender_id,
    source,
    source_id
  )
  values (
    selected_gift_type,
    gift_price,
    gift_price,
    receiver_user_id,
    sender_user_id,
    gift_source,
    source_uuid
  )
  returning id into saved_gift_transaction_id;

  if gift_source = 'story' then
    insert into public.story_gifts (
      gift_type,
      receiver_id,
      sender_id,
      story_id
    )
    values (
      selected_gift_type,
      receiver_user_id,
      sender_user_id,
      source_uuid
    )
    returning id into saved_activity_row_id;
  else
    insert into public.moment_gifts (
      gift_type,
      moment_id,
      receiver_id,
      sender_id
    )
    values (
      selected_gift_type,
      source_uuid,
      receiver_user_id,
      sender_user_id
    )
    returning id into saved_activity_row_id;
  end if;

  insert into public.wallet_transactions (
    user_id,
    transaction_type,
    gold_delta,
    reference_type,
    reference_id
  )
  values (
    sender_user_id,
    'gift_sent',
    -gift_price,
    selected_gift_type,
    source_uuid
  );

  return jsonb_build_object(
    'ok',
    true,
    'gift_transaction_id',
    saved_gift_transaction_id,
    'activity_row_id',
    saved_activity_row_id,
    'receiver_id',
    receiver_user_id,
    'gold_cost',
    gift_price,
    'gold_balance',
    next_sender_balance
  );
end;
$$;

revoke all on function public.record_social_gift_with_economy(uuid, text, text, uuid) from public;
grant execute on function public.record_social_gift_with_economy(uuid, text, text, uuid) to authenticated;
