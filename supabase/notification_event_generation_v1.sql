create extension if not exists pgcrypto;

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (
    type in (
      'new_like',
      'new_match',
      'new_message',
      'profile_view',
      'new_follower',
      'moment_like',
      'moment_comment',
      'gift_received',
      'private_media_received',
      'story_reaction',
      'story_reply',
      'story_gift',
      'low_gold',
      'mutual_attraction',
      'profile_trending',
      'streak_milestone',
      'profile_completion_reminder',
      'follow_request',
      'follow_request_accepted',
      'moderation_update',
      'premium_teaser',
      'incoming_call',
      'missed_call',
      'gift_reaction',
      'referral_joined',
      'weekly_recap_ready',
      'your_turn_reminder'
    )
  );

create or replace function public.create_deduped_notification(
  target_user_id uuid,
  notification_type text,
  notification_title text,
  notification_body text default '',
  notification_actor_id uuid default null,
  notification_metadata jsonb default '{}'::jsonb,
  dedupe_metadata_key text default null,
  dedupe_window interval default interval '24 hours'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  existing_notification_id uuid;
  saved_notification_id uuid;
begin
  if target_user_id is null or notification_type is null or notification_title is null then
    raise exception 'invalid_notification';
  end if;

  if current_user_id is not null
    and target_user_id <> current_user_id
    and notification_actor_id is distinct from current_user_id then
    raise exception 'not_allowed';
  end if;

  select id
  into existing_notification_id
  from public.notifications
  where user_id = target_user_id
    and type = notification_type
    and actor_id is not distinct from notification_actor_id
    and created_at >= timezone('utc', now()) - greatest(
      coalesce(dedupe_window, interval '24 hours'),
      interval '1 second'
    )
    and (
      dedupe_metadata_key is null
      or coalesce(metadata ->> dedupe_metadata_key, '') =
        coalesce(coalesce(notification_metadata, '{}'::jsonb) ->> dedupe_metadata_key, '')
    )
  order by created_at desc
  limit 1;

  if existing_notification_id is not null then
    return existing_notification_id;
  end if;

  insert into public.notifications (
    actor_id,
    body,
    metadata,
    title,
    type,
    user_id
  )
  values (
    notification_actor_id,
    coalesce(notification_body, ''),
    coalesce(notification_metadata, '{}'::jsonb),
    notification_title,
    notification_type,
    target_user_id
  )
  returning id into saved_notification_id;

  return saved_notification_id;
end;
$$;

revoke all on function public.create_deduped_notification(
  uuid,
  text,
  text,
  text,
  uuid,
  jsonb,
  text,
  interval
) from public;
grant execute on function public.create_deduped_notification(
  uuid,
  text,
  text,
  text,
  uuid,
  jsonb,
  text,
  interval
) to authenticated;

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

  perform public.create_deduped_notification(
    inviter_id,
    'referral_joined',
    'Referral joined',
    'Referral Gold recorded.',
    joined_user_id,
    jsonb_build_object(
      'referral_code',
      normalized_code,
      'referred_user_id',
      joined_user_id,
      'reward_gold',
      reward_amount
    ),
    'referred_user_id',
    interval '365 days'
  );

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

revoke all on function public.record_referral_join(text, uuid) from public;
grant execute on function public.record_referral_join(text, uuid) to anon, authenticated;
