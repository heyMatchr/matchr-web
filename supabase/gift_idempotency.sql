alter table public.gift_transactions
  add column if not exists client_request_id uuid;

alter table public.story_gifts
  add column if not exists client_request_id uuid;

alter table public.moment_gifts
  add column if not exists client_request_id uuid;

create unique index if not exists gift_transactions_sender_request_unique_idx
  on public.gift_transactions (sender_id, client_request_id)
  where client_request_id is not null;

create unique index if not exists story_gifts_sender_request_unique_idx
  on public.story_gifts (sender_id, client_request_id)
  where client_request_id is not null;

create unique index if not exists moment_gifts_sender_request_unique_idx
  on public.moment_gifts (sender_id, client_request_id)
  where client_request_id is not null;

drop function if exists public.send_chat_gift_with_economy(uuid, uuid, text);
drop function if exists public.record_social_gift_with_economy(uuid, text, text, uuid);

create or replace function public.send_chat_gift_with_economy(
  receiver_user_id uuid,
  active_match_id uuid,
  selected_gift_type text,
  client_request_id uuid default null
)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_user_id uuid := auth.uid();
  request_uuid uuid := client_request_id;
  gift_catalog jsonb;
  selected_gift jsonb;
  gift_name text;
  gift_price integer;
  next_sender_balance integer;
  existing_transaction record;
  existing_message public.messages%rowtype;
  saved_message public.messages%rowtype;
begin
  if sender_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if request_uuid is not null then
    select *
    into existing_transaction
    from public.gift_transactions gt
    where gt.sender_id = sender_user_id
      and gt.client_request_id = request_uuid
    limit 1;

    if existing_transaction.id is not null then
      select *
      into existing_message
      from public.messages
      where messages.id = existing_transaction.message_id;

      if existing_message.id is null then
        raise exception 'gift_already_recorded';
      end if;

      return existing_message;
    end if;
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
    client_request_id,
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
    request_uuid,
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
  source_uuid uuid,
  client_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_user_id uuid := auth.uid();
  request_uuid uuid := client_request_id;
  gift_catalog jsonb;
  selected_gift jsonb;
  gift_price integer;
  next_sender_balance integer;
  existing_transaction record;
  saved_gift_transaction_id uuid;
  saved_activity_row_id uuid;
begin
  if sender_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if request_uuid is not null then
    select *
    into existing_transaction
    from public.gift_transactions gt
    where gt.sender_id = sender_user_id
      and gt.client_request_id = request_uuid
    limit 1;

    if existing_transaction.id is not null then
      if existing_transaction.source = 'story' then
        select sg.id
        into saved_activity_row_id
        from public.story_gifts sg
        where sg.sender_id = sender_user_id
          and sg.client_request_id = request_uuid
        limit 1;
      elsif existing_transaction.source = 'moment' then
        select mg.id
        into saved_activity_row_id
        from public.moment_gifts mg
        where mg.sender_id = sender_user_id
          and mg.client_request_id = request_uuid
        limit 1;
      end if;

      return jsonb_build_object(
        'ok',
        true,
        'idempotent',
        true,
        'gift_transaction_id',
        existing_transaction.id,
        'activity_row_id',
        saved_activity_row_id,
        'source_type',
        existing_transaction.source,
        'source_id',
        existing_transaction.source_id,
        'receiver_id',
        existing_transaction.receiver_id,
        'gold_cost',
        coalesce(existing_transaction.gold_cost, existing_transaction.coin_price)
      );
    end if;
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
    client_request_id,
    gift_type,
    coin_price,
    gold_cost,
    receiver_id,
    sender_id,
    source,
    source_id
  )
  values (
    request_uuid,
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
      client_request_id,
      gift_type,
      receiver_id,
      sender_id,
      story_id
    )
    values (
      request_uuid,
      selected_gift_type,
      receiver_user_id,
      sender_user_id,
      source_uuid
    )
    returning id into saved_activity_row_id;
  else
    insert into public.moment_gifts (
      client_request_id,
      gift_type,
      moment_id,
      receiver_id,
      sender_id
    )
    values (
      request_uuid,
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
    'idempotent',
    false,
    'gift_transaction_id',
    saved_gift_transaction_id,
    'activity_row_id',
    saved_activity_row_id,
    'source_type',
    gift_source,
    'source_id',
    source_uuid,
    'receiver_id',
    receiver_user_id,
    'gold_cost',
    gift_price,
    'gold_balance',
    next_sender_balance
  );
end;
$$;

revoke all on function public.send_chat_gift_with_economy(uuid, uuid, text, uuid) from public;
revoke all on function public.record_social_gift_with_economy(uuid, text, text, uuid, uuid) from public;

grant execute on function public.send_chat_gift_with_economy(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.record_social_gift_with_economy(uuid, text, text, uuid, uuid) to authenticated;
