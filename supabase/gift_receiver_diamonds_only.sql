create or replace function public.send_chat_gift_with_economy(
  receiver_user_id uuid,
  active_match_id uuid,
  selected_gift_type text
)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_user_id uuid := auth.uid();
  gift_catalog jsonb;
  selected_gift jsonb;
  gift_name text;
  gift_price integer;
  next_sender_balance integer;
  saved_message public.messages%rowtype;
begin
  if sender_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if sender_user_id = receiver_user_id then
    raise exception 'invalid_gift';
  end if;

  if public.users_are_blocked(sender_user_id, receiver_user_id) then
    raise exception 'blocked';
  end if;

  if not exists (
    select 1
    from public.matches
    where matches.id = active_match_id
      and (
        (
          matches.user_one_id = sender_user_id
          and matches.user_two_id = receiver_user_id
        )
        or
        (
          matches.user_two_id = sender_user_id
          and matches.user_one_id = receiver_user_id
        )
      )
  ) then
    raise exception 'not_matched';
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

  gift_name := coalesce(selected_gift ->> 'name', selected_gift_type);
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

  insert into public.messages (
    content,
    gift_type,
    match_id,
    message_type,
    receiver_id,
    sender_id
  )
  values (
    concat(gift_name, ' · ', gift_price, ' Gold'),
    selected_gift_type,
    active_match_id,
    'gift',
    receiver_user_id,
    sender_user_id
  )
  returning * into saved_message;

  insert into public.gift_transactions (
    gift_type,
    coin_price,
    gold_cost,
    message_id,
    receiver_id,
    sender_id,
    source,
    source_id
  )
  values (
    selected_gift_type,
    gift_price,
    gift_price,
    saved_message.id,
    receiver_user_id,
    sender_user_id,
    'chat',
    active_match_id
  );

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
    saved_message.id
  );

  return saved_message;
end;
$$;

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
  );

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
    'gift_price',
    gift_price,
    'gold_balance',
    next_sender_balance
  );
end;
$$;

revoke all on function public.send_chat_gift_with_economy(uuid, uuid, text) from public;
revoke all on function public.record_social_gift_with_economy(uuid, text, text, uuid) from public;

grant execute on function public.send_chat_gift_with_economy(uuid, uuid, text) to authenticated;
grant execute on function public.record_social_gift_with_economy(uuid, text, text, uuid) to authenticated;
