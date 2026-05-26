create extension if not exists pgcrypto;

create table if not exists public.economy_config (
  key text primary key,
  value_json jsonb not null,
  description text not null default '',
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.economy_config (key, value_json, description)
values
  ('starter_gold_male', '100'::jsonb, 'Gold granted once after onboarding for masculine identity defaults.'),
  ('starter_gold_female', '0'::jsonb, 'Gold granted once after onboarding for feminine identity defaults.'),
  ('premium_weekly_price_usd', '3.99'::jsonb, 'Weekly placeholder price for Matchr Premium.'),
  (
    'message_rules',
    '{
      "male_to_female": 5,
      "female_to_male": 0,
      "male_to_male": 3,
      "female_to_female": 0,
      "nonbinary_default": 2,
      "premium_discount_percent": 60,
      "conversation_free_after_reply": true
    }'::jsonb,
    'Configurable message gold costs. Identity-aware defaults avoid forcing binary-only matching.'
  ),
  (
    'gift_catalog',
    '[
      { "id":"rose","name":"Rose","price":5 },
      { "id":"kiss","name":"Kiss","price":8 },
      { "id":"heart_box","name":"Heart Box","price":10 },
      { "id":"teddy","name":"Teddy","price":20 },
      { "id":"wine","name":"Wine","price":30 },
      { "id":"private_jet","name":"Private Jet","price":80 },
      { "id":"diamond_ring","name":"Diamond Ring","price":120 },
      { "id":"matchr_crown","name":"Matchr Crown","price":150 }
    ]'::jsonb,
    'Gift catalog rendered by chat, stories, moments, and transaction logic.'
  ),
  (
    'creator_split',
    '{ "platform_percent": 60, "receiver_percent": 40 }'::jsonb,
    'Demo creator split for future creator monetization.'
  )
on conflict (key) do update
set
  value_json = excluded.value_json,
  description = excluded.description,
  updated_at = timezone('utc', now());

alter table public.economy_config enable row level security;

grant usage on schema public to authenticated;
grant select on public.economy_config to authenticated;
revoke insert, update, delete on public.economy_config from authenticated;

drop policy if exists "Authenticated users can read economy config" on public.economy_config;

create policy "Authenticated users can read economy config"
  on public.economy_config
  for select
  to authenticated
  using (true);

create or replace function public.grant_starter_gold_once(
  target_user_id uuid,
  gold_amount integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_wallet public.user_wallets%rowtype;
begin
  if auth.uid() <> target_user_id or gold_amount <= 0 then
    return 0;
  end if;

  insert into public.user_wallets (user_id, gold_balance)
  values (target_user_id, gold_amount)
  on conflict (user_id) do nothing
  returning * into inserted_wallet;

  if inserted_wallet.user_id is null then
    return 0;
  end if;

  insert into public.wallet_transactions (
    user_id,
    transaction_type,
    gold_delta,
    reference_type
  )
  values (
    target_user_id,
    'adjustment',
    gold_amount,
    'Starter Gold Bonus'
  );

  return gold_amount;
end;
$$;

create or replace function public.charge_message_gold(
  receiver_user_id uuid,
  active_match_id uuid,
  gold_amount integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_user_id uuid := auth.uid();
  next_balance integer;
begin
  if sender_user_id is null or gold_amount <= 0 then
    return jsonb_build_object('ok', true, 'charged', 0);
  end if;

  if sender_user_id = receiver_user_id then
    return jsonb_build_object('ok', false, 'error', 'invalid_receiver');
  end if;

  if public.users_are_blocked(sender_user_id, receiver_user_id) then
    return jsonb_build_object('ok', false, 'error', 'blocked');
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
    return jsonb_build_object('ok', false, 'error', 'not_matched');
  end if;

  update public.user_wallets
  set
    gold_balance = gold_balance - gold_amount,
    updated_at = timezone('utc', now())
  where user_id = sender_user_id
    and gold_balance >= gold_amount
  returning gold_balance into next_balance;

  if next_balance is null then
    return jsonb_build_object('ok', false, 'error', 'insufficient_gold');
  end if;

  insert into public.message_charges (
    sender_id,
    receiver_id,
    gold_cost
  )
  values (
    sender_user_id,
    receiver_user_id,
    gold_amount
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
    'message_charge',
    -gold_amount,
    'message',
    active_match_id
  );

  return jsonb_build_object(
    'ok',
    true,
    'charged',
    gold_amount,
    'gold_balance',
    next_balance
  );
end;
$$;

create or replace function public.process_chat_gift_economy(
  receiver_user_id uuid,
  active_match_id uuid,
  sent_message_id uuid,
  selected_gift_type text,
  gift_price integer,
  receiver_gold integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_user_id uuid := auth.uid();
  next_sender_balance integer;
begin
  if sender_user_id is null or gift_price <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_gift');
  end if;

  if sender_user_id = receiver_user_id then
    return jsonb_build_object('ok', false, 'error', 'invalid_receiver');
  end if;

  if public.users_are_blocked(sender_user_id, receiver_user_id) then
    return jsonb_build_object('ok', false, 'error', 'blocked');
  end if;

  if not exists (
    select 1
    from public.messages
    where messages.id = sent_message_id
      and messages.match_id = active_match_id
      and messages.sender_id = sender_user_id
      and messages.receiver_id = receiver_user_id
      and messages.message_type = 'gift'
  ) then
    return jsonb_build_object('ok', false, 'error', 'missing_message');
  end if;

  update public.user_wallets
  set
    gold_balance = gold_balance - gift_price,
    updated_at = timezone('utc', now())
  where user_id = sender_user_id
    and gold_balance >= gift_price
  returning gold_balance into next_sender_balance;

  if next_sender_balance is null then
    return jsonb_build_object('ok', false, 'error', 'insufficient_gold');
  end if;

  insert into public.user_wallets (user_id, gold_balance)
  values (receiver_user_id, greatest(0, receiver_gold))
  on conflict (user_id) do update
  set
    gold_balance = public.user_wallets.gold_balance + greatest(0, receiver_gold),
    updated_at = timezone('utc', now());

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
    sent_message_id,
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
  values
    (
      sender_user_id,
      'gift_sent',
      -gift_price,
      selected_gift_type,
      sent_message_id
    ),
    (
      receiver_user_id,
      'gift_received',
      greatest(0, receiver_gold),
      selected_gift_type,
      sent_message_id
    );

  return jsonb_build_object(
    'ok',
    true,
    'gold_balance',
    next_sender_balance,
    'receiver_gold',
    greatest(0, receiver_gold)
  );
end;
$$;

create or replace function public.send_text_message_with_economy(
  receiver_user_id uuid,
  active_match_id uuid,
  message_body text,
  gold_amount integer
)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_user_id uuid := auth.uid();
  next_balance integer;
  saved_message public.messages%rowtype;
begin
  if sender_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if char_length(trim(coalesce(message_body, ''))) = 0
    or char_length(message_body) > 1000 then
    raise exception 'invalid_message';
  end if;

  if sender_user_id = receiver_user_id then
    raise exception 'invalid_receiver';
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

  if gold_amount > 0 then
    update public.user_wallets
    set
      gold_balance = gold_balance - gold_amount,
      updated_at = timezone('utc', now())
    where user_id = sender_user_id
      and gold_balance >= gold_amount
    returning gold_balance into next_balance;

    if next_balance is null then
      raise exception 'insufficient_gold';
    end if;
  end if;

  insert into public.messages (
    content,
    match_id,
    message_type,
    receiver_id,
    sender_id
  )
  values (
    trim(message_body),
    active_match_id,
    'text',
    receiver_user_id,
    sender_user_id
  )
  returning * into saved_message;

  if gold_amount > 0 then
    insert into public.message_charges (
      sender_id,
      receiver_id,
      message_id,
      gold_cost
    )
    values (
      sender_user_id,
      receiver_user_id,
      saved_message.id,
      gold_amount
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
      'message_charge',
      -gold_amount,
      'message',
      saved_message.id
    );
  end if;

  return saved_message;
end;
$$;

create or replace function public.send_chat_gift_with_economy(
  receiver_user_id uuid,
  active_match_id uuid,
  selected_gift_type text,
  gift_name text,
  gift_icon text,
  gift_price integer,
  receiver_gold integer
)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_user_id uuid := auth.uid();
  next_sender_balance integer;
  saved_message public.messages%rowtype;
begin
  if sender_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if sender_user_id = receiver_user_id or gift_price <= 0 then
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
    concat(gift_icon, ' ', gift_name, ' · ', gift_price, ' coins'),
    selected_gift_type,
    active_match_id,
    'gift',
    receiver_user_id,
    sender_user_id
  )
  returning * into saved_message;

  insert into public.user_wallets (user_id, gold_balance)
  values (receiver_user_id, greatest(0, receiver_gold))
  on conflict (user_id) do update
  set
    gold_balance = public.user_wallets.gold_balance + greatest(0, receiver_gold),
    updated_at = timezone('utc', now());

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
  values
    (
      sender_user_id,
      'gift_sent',
      -gift_price,
      selected_gift_type,
      saved_message.id
    ),
    (
      receiver_user_id,
      'gift_received',
      greatest(0, receiver_gold),
      selected_gift_type,
      saved_message.id
    );

  return saved_message;
end;
$$;

revoke all on function public.grant_starter_gold_once(uuid, integer) from public;
revoke all on function public.charge_message_gold(uuid, uuid, integer) from public;
revoke all on function public.process_chat_gift_economy(uuid, uuid, uuid, text, integer, integer) from public;
revoke all on function public.send_text_message_with_economy(uuid, uuid, text, integer) from public;
revoke all on function public.send_chat_gift_with_economy(uuid, uuid, text, text, text, integer, integer) from public;

grant execute on function public.grant_starter_gold_once(uuid, integer) to authenticated;
grant execute on function public.charge_message_gold(uuid, uuid, integer) to authenticated;
grant execute on function public.process_chat_gift_economy(uuid, uuid, uuid, text, integer, integer) to authenticated;
grant execute on function public.send_text_message_with_economy(uuid, uuid, text, integer) to authenticated;
grant execute on function public.send_chat_gift_with_economy(uuid, uuid, text, text, text, integer, integer) to authenticated;
