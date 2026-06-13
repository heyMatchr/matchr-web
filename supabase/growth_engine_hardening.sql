create extension if not exists pgcrypto;

alter table public.economy_config
  add column if not exists value jsonb;

update public.economy_config
set value = coalesce(value, value_json)
where value is null;

alter table public.referral_events
  drop constraint if exists referral_events_type_check;

alter table public.referral_events
  add constraint referral_events_type_check
  check (
    event_type in ('invite_sent', 'invite_opened', 'join')
  );

insert into public.economy_config (key, value_json, value, description)
values (
  'referral_reward_gold',
  '25'::jsonb,
  '25'::jsonb,
  'Referral Gold recorded after a successful invited join. This is ledger-only until an admin payout flow is enabled.'
)
on conflict (key) do nothing;

with duplicate_join_events as (
  select
    id,
    row_number() over (
      partition by referred_user_id
      order by created_at asc, id asc
    ) as row_number
  from public.referral_events
  where event_type = 'join'
    and referred_user_id is not null
)
delete from public.referral_events
where id in (
  select id
  from duplicate_join_events
  where row_number > 1
);

create unique index if not exists referral_events_join_referred_unique_idx
  on public.referral_events (referred_user_id)
  where event_type = 'join'
    and referred_user_id is not null;

with duplicate_rewards as (
  select
    id,
    row_number() over (
      partition by referred_user_id
      order by created_at asc, id asc
    ) as row_number
  from public.referral_rewards
)
delete from public.referral_rewards
where id in (
  select id
  from duplicate_rewards
  where row_number > 1
);

create unique index if not exists referral_rewards_referred_unique_idx
  on public.referral_rewards (referred_user_id);

create or replace function public.record_referral_invite_open(
  invite_code text,
  invite_source text default 'signup'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_code text := upper(trim(coalesce(invite_code, '')));
  inviter_id uuid;
begin
  if normalized_code = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing_referral');
  end if;

  select user_id
  into inviter_id
  from public.referral_codes
  where code = normalized_code;

  if inviter_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_referral');
  end if;

  insert into public.referral_events (
    inviter_user_id,
    referral_code,
    event_type,
    source
  )
  values (
    inviter_id,
    normalized_code,
    'invite_opened',
    coalesce(nullif(invite_source, ''), 'signup')
  );

  return jsonb_build_object(
    'inviter_user_id',
    inviter_id,
    'ok',
    true
  );
end;
$$;

create or replace function public.record_referral_join(
  invite_code text,
  joined_user_id uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_code text := upper(trim(coalesce(invite_code, '')));
  inviter_id uuid;
  reward_amount integer := 25;
  existing_reward public.referral_rewards%rowtype;
begin
  if joined_user_id is null or normalized_code = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing_referral');
  end if;

  select user_id
  into inviter_id
  from public.referral_codes
  where code = normalized_code;

  if inviter_id is null or inviter_id = joined_user_id then
    return jsonb_build_object('ok', false, 'reason', 'invalid_referral');
  end if;

  select *
  into existing_reward
  from public.referral_rewards
  where referred_user_id = joined_user_id
  limit 1;

  if existing_reward.id is not null then
    return jsonb_build_object(
      'gold_amount',
      existing_reward.gold_amount,
      'inviter_user_id',
      existing_reward.inviter_user_id,
      'ok',
      true,
      'already_recorded',
      true
    );
  end if;

  select greatest(
    0,
    coalesce(nullif(value_json #>> '{}', '')::integer, 25)
  )
  into reward_amount
  from public.economy_config
  where key = 'referral_reward_gold';

  reward_amount := coalesce(reward_amount, 25);

  insert into public.referral_events (
    inviter_user_id,
    referred_user_id,
    referral_code,
    event_type,
    source
  )
  values (
    inviter_id,
    joined_user_id,
    normalized_code,
    'join',
    'signup'
  )
  on conflict do nothing;

  if reward_amount > 0 then
    insert into public.referral_rewards (
      inviter_user_id,
      referred_user_id,
      gold_amount,
      status
    )
    values (
      inviter_id,
      joined_user_id,
      reward_amount,
      'earned'
    )
    on conflict do nothing;
  end if;

  return jsonb_build_object(
    'gold_amount',
    reward_amount,
    'inviter_user_id',
    inviter_id,
    'ok',
    true,
    'already_recorded',
    false
  );
end;
$$;

revoke all on function public.record_referral_invite_open(text, text) from public;
grant execute on function public.record_referral_invite_open(text, text) to anon, authenticated;
