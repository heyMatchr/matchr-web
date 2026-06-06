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

create or replace function public.send_media_message_with_economy(
  receiver_user_id uuid,
  active_match_id uuid,
  media_message_type text,
  stored_media_url text,
  stored_media_type text
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
  has_premium boolean;
  next_balance integer;
  saved_message public.messages%rowtype;
begin
  if sender_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if sender_user_id = receiver_user_id then
    raise exception 'invalid_receiver';
  end if;

  if media_message_type not in ('image', 'video', 'private_media') then
    raise exception 'invalid_media_message_type';
  end if;

  if stored_media_type not in ('image', 'video') then
    raise exception 'invalid_media_type';
  end if;

  if stored_media_url is null or char_length(trim(stored_media_url)) = 0 then
    raise exception 'invalid_media_url';
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
  sender_bucket := public.economy_identity_bucket(
    sender_profile.gender,
    sender_profile.gender_identity
  );
  receiver_bucket := public.economy_identity_bucket(
    receiver_profile.gender,
    receiver_profile.gender_identity
  );

  if sender_bucket = 'male' then
    raw_cost := public.economy_json_number(
      rules,
      'male_message_cost',
      public.economy_json_number(rules, 'male_to_female', 5)
    )::integer;
  elsif sender_bucket = 'female' then
    raw_cost := public.economy_json_number(rules, 'female_message_cost', 0)::integer;
  else
    rule_key := sender_bucket || '_to_' || receiver_bucket;
    raw_cost := public.economy_json_number(
      rules,
      rule_key,
      public.economy_json_number(rules, 'nonbinary_default', 2)
    )::integer;
  end if;

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
    media_type,
    media_url,
    message_type,
    receiver_id,
    sender_id
  )
  values (
    '',
    active_match_id,
    stored_media_type,
    trim(stored_media_url),
    media_message_type,
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

revoke all on function public.send_media_message_with_economy(uuid, uuid, text, text, text) from public;
grant execute on function public.send_media_message_with_economy(uuid, uuid, text, text, text) to authenticated;

drop policy if exists "Users can send match messages" on public.messages;

create policy "Users can send match messages"
  on public.messages
  for insert
  to authenticated
  with check (
    coalesce(message_type, 'text') not in ('text', 'image', 'video', 'private_media')
    and auth.uid() = sender_id
    and sender_id <> receiver_id
    and exists (
      select 1
      from public.matches
      where matches.id = messages.match_id
        and (
          matches.user_one_id = auth.uid()
          or matches.user_two_id = auth.uid()
        )
        and (
          messages.receiver_id = matches.user_one_id
          or messages.receiver_id = matches.user_two_id
        )
        and messages.receiver_id <> auth.uid()
    )
  );
