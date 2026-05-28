create extension if not exists pgcrypto;

-- Private chat media must not share the public moments/stories media bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'private-media',
  'private-media',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can upload their private media" on storage.objects;
drop policy if exists "Users can delete their private media" on storage.objects;
drop policy if exists "Users can read private media directly" on storage.objects;

create policy "Users can upload their private media"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'private-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete their private media"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'private-media'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Wallet balances are server/RPC owned. Users may read but may not directly
-- create or mutate wallet rows with arbitrary balances.
revoke insert, update, delete on public.user_wallets from authenticated;
drop policy if exists "Users can create their wallet" on public.user_wallets;

-- Profile trust, premium, verification, and moderation fields are protected.
revoke update on public.profiles from authenticated;
grant update (
  display_name,
  age,
  gender,
  gender_identity,
  pronouns,
  sexual_orientation,
  show_gender_on_profile,
  show_orientation_on_profile,
  interested_in,
  occupation,
  interests,
  relationship_intent,
  bio,
  location,
  avatar_url,
  height,
  weight,
  body_type,
  relationship_status,
  country,
  country_flag,
  accepting_dating,
  open_to_long_distance,
  drinking,
  smoking,
  looking_for,
  onboarding_completed,
  is_online,
  last_seen_at,
  last_active_at,
  updated_at
) on public.profiles to authenticated;

revoke update (
  premium,
  verified,
  phone_verified,
  identity_verified,
  moderation_score,
  under_review,
  shadow_restricted,
  discover_hidden,
  messaging_limited,
  calls_limited,
  trusted_user,
  risk_level
) on public.profiles from authenticated;

create or replace function public.economy_identity_bucket(
  profile_gender text,
  profile_gender_identity text
)
returns text
language sql
immutable
as $$
  select case
    when lower(coalesce(profile_gender_identity, profile_gender, '')) in ('man', 'male', 'trans man') then 'male'
    when lower(coalesce(profile_gender_identity, profile_gender, '')) in ('woman', 'female', 'trans woman') then 'female'
    else 'nonbinary'
  end;
$$;

create or replace function public.economy_json_number(
  source_json jsonb,
  source_key text,
  fallback numeric
)
returns numeric
language sql
immutable
as $$
  select coalesce(nullif(source_json ->> source_key, '')::numeric, fallback);
$$;

-- Safer starter bonus: amount is computed in the database from economy_config.
create or replace function public.grant_starter_gold_once()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid := auth.uid();
  target_profile public.profiles%rowtype;
  identity_bucket text;
  config_key text;
  starter_amount integer;
  inserted_wallet public.user_wallets%rowtype;
begin
  if target_user_id is null then
    return 0;
  end if;

  select *
  into target_profile
  from public.profiles
  where id = target_user_id;

  if target_profile.id is null then
    return 0;
  end if;

  identity_bucket := public.economy_identity_bucket(
    target_profile.gender,
    target_profile.gender_identity
  );
  config_key := case
    when identity_bucket = 'male' then 'starter_gold_male'
    when identity_bucket = 'female' then 'starter_gold_female'
    else null
  end;

  if config_key is null then
    return 0;
  end if;

  select greatest(0, coalesce((value_json #>> '{}')::integer, 0))
  into starter_amount
  from public.economy_config
  where key = config_key;

  if coalesce(starter_amount, 0) <= 0 then
    return 0;
  end if;

  insert into public.user_wallets (user_id, gold_balance)
  values (target_user_id, starter_amount)
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
    starter_amount,
    'Starter Gold Bonus'
  );

  return starter_amount;
end;
$$;

create or replace function public.send_text_message_with_economy(
  receiver_user_id uuid,
  active_match_id uuid,
  message_body text
)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_user_id uuid := auth.uid();
  sender_profile record;
  receiver_profile record;
  rules jsonb;
  sender_bucket text;
  receiver_bucket text;
  rule_key text;
  raw_cost integer;
  final_cost integer;
  discount numeric;
  has_receiver_reply boolean;
  has_premium boolean;
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

  select gender, gender_identity
  into sender_profile
  from public.profiles
  where id = sender_user_id;

  select gender, gender_identity
  into receiver_profile
  from public.profiles
  where id = receiver_user_id;

  select coalesce(value_json, '{}'::jsonb)
  into rules
  from public.economy_config
  where key = 'message_rules';

  rules := coalesce(rules, '{}'::jsonb);
  has_receiver_reply := exists (
    select 1
    from public.messages
    where match_id = active_match_id
      and sender_id = receiver_user_id
      and receiver_id = sender_user_id
      and message_type not in ('call_event', 'private_media_opened', 'private_media_expired')
  );

  if coalesce((rules ->> 'conversation_free_after_reply')::boolean, true)
    and has_receiver_reply then
    final_cost := 0;
  else
    sender_bucket := public.economy_identity_bucket(
      sender_profile.gender,
      sender_profile.gender_identity
    );
    receiver_bucket := public.economy_identity_bucket(
      receiver_profile.gender,
      receiver_profile.gender_identity
    );
    rule_key := sender_bucket || '_to_' || receiver_bucket;
    raw_cost := public.economy_json_number(
      rules,
      rule_key,
      public.economy_json_number(rules, 'nonbinary_default', 2)
    )::integer;

    has_premium := exists (
      select 1
      from public.premium_subscriptions
      where user_id = sender_user_id
        and status = 'active'
        and (expires_at is null or expires_at > timezone('utc', now()))
    );

    if has_premium and raw_cost > 0 then
      discount := least(
        100,
        greatest(0, public.economy_json_number(rules, 'premium_discount_percent', 60))
      );
      final_cost := greatest(0, ceiling(raw_cost * ((100 - discount) / 100))::integer);
    else
      final_cost := greatest(0, raw_cost);
    end if;
  end if;

  if final_cost > 0 then
    update public.user_wallets
    set
      gold_balance = gold_balance - final_cost,
      updated_at = timezone('utc', now())
    where user_id = sender_user_id
      and gold_balance >= final_cost
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

  if final_cost > 0 then
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
      final_cost
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
      -final_cost,
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
  split jsonb;
  receiver_gold integer;
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

  select coalesce(value_json, '{"receiver_percent":40}'::jsonb)
  into split
  from public.economy_config
  where key = 'creator_split';

  receiver_gold := floor(
    gift_price *
    (least(100, greatest(0, public.economy_json_number(split, 'receiver_percent', 40))) / 100)
  )::integer;

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
  split jsonb;
  receiver_gold integer;
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

  select coalesce(value_json, '{"receiver_percent":40}'::jsonb)
  into split
  from public.economy_config
  where key = 'creator_split';

  receiver_gold := floor(
    gift_price *
    (least(100, greatest(0, public.economy_json_number(split, 'receiver_percent', 40))) / 100)
  )::integer;

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
  values
    (
      sender_user_id,
      'gift_sent',
      -gift_price,
      selected_gift_type,
      source_uuid
    ),
    (
      receiver_user_id,
      'gift_received',
      greatest(0, receiver_gold),
      selected_gift_type,
      source_uuid
    );

  return jsonb_build_object(
    'ok',
    true,
    'gift_price',
    gift_price,
    'receiver_gold',
    greatest(0, receiver_gold),
    'gold_balance',
    next_sender_balance
  );
end;
$$;

revoke all on function public.grant_starter_gold_once(uuid, integer) from authenticated;
revoke all on function public.charge_message_gold(uuid, uuid, integer) from authenticated;
revoke all on function public.process_chat_gift_economy(uuid, uuid, uuid, text, integer, integer) from authenticated;
revoke all on function public.send_text_message_with_economy(uuid, uuid, text, integer) from authenticated;
revoke all on function public.send_chat_gift_with_economy(uuid, uuid, text, text, text, integer, integer) from authenticated;
revoke insert on public.gift_transactions from authenticated;
drop policy if exists "Users can create sent gift transactions" on public.gift_transactions;

revoke all on function public.grant_starter_gold_once() from public;
revoke all on function public.send_text_message_with_economy(uuid, uuid, text) from public;
revoke all on function public.send_chat_gift_with_economy(uuid, uuid, text) from public;
revoke all on function public.record_social_gift_with_economy(uuid, text, text, uuid) from public;

grant execute on function public.grant_starter_gold_once() to authenticated;
grant execute on function public.send_text_message_with_economy(uuid, uuid, text) to authenticated;
grant execute on function public.send_chat_gift_with_economy(uuid, uuid, text) to authenticated;
grant execute on function public.record_social_gift_with_economy(uuid, text, text, uuid) to authenticated;
