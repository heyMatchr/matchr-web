create extension if not exists pgcrypto;

-- Security Critical Patch V1
-- Apply before broader live-user testing. This patch locks down broad social
-- writes/reads and adds DB-level payment credit idempotency.

-- profile_views: users may only read rows related to themselves; admins may read
-- for moderation/support. Service-role clients bypass RLS.
alter table public.profile_views enable row level security;

revoke select on public.profile_views from anon;
grant select, insert on public.profile_views to authenticated;

drop policy if exists "Authenticated users can read profile views" on public.profile_views;
drop policy if exists "Users can read related profile views" on public.profile_views;
drop policy if exists "Users can read own profile views" on public.profile_views;

create policy "Users can read own profile views"
  on public.profile_views
  for select
  to authenticated
  using (
    viewer_id = auth.uid()
    or viewed_user_id = auth.uid()
    or public.is_admin(auth.uid())
  );

-- notifications: remove direct client insert capability. App/user-facing writes
-- must go through create_safe_notification(), trusted SECURITY DEFINER functions,
-- or service-role server code.
alter table public.notifications enable row level security;

revoke insert on public.notifications from authenticated;
revoke insert on public.notifications from anon;
grant select, update on public.notifications to authenticated;

drop policy if exists "Users can create notifications as actor" on public.notifications;
drop policy if exists "Users can create safe notifications" on public.notifications;

create or replace function public.create_safe_notification(
  target_user_id uuid,
  notification_type text,
  notification_title text,
  notification_body text default '',
  notification_metadata jsonb default '{}'::jsonb,
  notification_actor_id uuid default auth.uid()
)
returns public.notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  saved_notification public.notifications%rowtype;
  safe_type text := trim(coalesce(notification_type, ''));
  safe_title text := left(trim(coalesce(notification_title, '')), 120);
  safe_body text := left(coalesce(notification_body, ''), 500);
  safe_metadata jsonb := coalesce(notification_metadata, '{}'::jsonb);
begin
  if actor_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if target_user_id is null then
    raise exception 'invalid_notification_target';
  end if;

  if safe_title = '' then
    raise exception 'invalid_notification_title';
  end if;

  if safe_type not in (
    'new_like',
    'new_match',
    'mutual_attraction',
    'new_message',
    'private_media_received',
    'profile_view',
    'new_follower',
    'story_reaction',
    'story_reply',
    'story_gift',
    'moment_like',
    'moment_comment',
    'gift_received',
    'gift_reaction',
    'low_gold',
    'referral_joined',
    'weekly_recap_ready',
    'your_turn_reminder',
    'premium_expiring',
    'elite_near_level',
    'creator_goal_progress'
  ) then
    raise exception 'invalid_notification_type';
  end if;

  if target_user_id = actor_user_id
    and coalesce(notification_actor_id, actor_user_id) = actor_user_id
    and safe_type not in (
      'low_gold',
      'weekly_recap_ready',
      'your_turn_reminder',
      'premium_expiring',
      'elite_near_level',
      'creator_goal_progress'
    ) then
    raise exception 'invalid_notification_target';
  end if;

  if notification_actor_id is not null
    and notification_actor_id <> actor_user_id
    and target_user_id <> actor_user_id then
    raise exception 'invalid_notification_actor';
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
    actor_user_id,
    safe_body,
    safe_metadata,
    safe_title,
    safe_type,
    target_user_id
  )
  returning * into saved_notification;

  return saved_notification;
end;
$$;

revoke all on function public.create_safe_notification(
  uuid,
  text,
  text,
  text,
  jsonb,
  uuid
) from public;
grant execute on function public.create_safe_notification(
  uuid,
  text,
  text,
  text,
  jsonb,
  uuid
) to authenticated;

-- referral joins: keep the signature for app compatibility, but never trust a
-- caller-supplied joined_user_id. The joined user must be the authenticated user.
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
  authenticated_user_id uuid := auth.uid();
  normalized_code text := upper(trim(coalesce(invite_code, '')));
  inviter_id uuid;
  reward_amount integer := 25;
  existing_reward public.referral_rewards%rowtype;
begin
  if authenticated_user_id is null or normalized_code = '' then
    return jsonb_build_object('ok', false, 'reason', 'missing_referral');
  end if;

  if joined_user_id is not null and joined_user_id <> authenticated_user_id then
    raise exception 'invalid_referral_join_user';
  end if;

  joined_user_id := authenticated_user_id;

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

revoke all on function public.record_referral_join(text, uuid) from public;
grant execute on function public.record_referral_join(text, uuid) to authenticated;

-- Payment idempotency: one wallet credit row per payment order reference.
-- This first removes duplicated historical rows so the partial unique index can
-- be created safely. It does not alter wallet balances.
with duplicated_payment_order_credits as (
  select
    id,
    row_number() over (
      partition by reference_id
      order by created_at asc, id asc
    ) as row_number
  from public.wallet_transactions
  where reference_type = 'payment_order'
    and reference_id is not null
)
delete from public.wallet_transactions
where id in (
  select id
  from duplicated_payment_order_credits
  where row_number > 1
);

create unique index if not exists wallet_transactions_payment_order_unique_idx
  on public.wallet_transactions (reference_id)
  where reference_type = 'payment_order'
    and reference_id is not null;

-- Direct grant verification for critical economy tables.
revoke insert on public.gift_transactions from authenticated;
revoke insert on public.gift_transactions from anon;
drop policy if exists "Users can create sent gift transactions" on public.gift_transactions;

revoke insert on public.messages from anon;
grant select, insert on public.messages to authenticated;
drop policy if exists "Users can send match messages" on public.messages;

create policy "Users can send match messages"
  on public.messages
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and coalesce(message_type, 'text') not in ('text', 'image', 'video', 'private_media')
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
    and not public.users_are_blocked(messages.sender_id, messages.receiver_id)
  );
