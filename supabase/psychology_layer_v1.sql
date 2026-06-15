-- Psychology Layer V1
-- Retention foundation: daily rewards, user streaks, achievements.
-- This migration is additive and does NOT touch private media, gifts,
-- chat economy pricing, wallet payment logic, Paystack or storage.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.user_streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  last_claim_date date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.daily_reward_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  claim_date date not null default timezone('utc', now())::date,
  streak_day integer not null check (streak_day >= 1),
  gold_amount integer not null check (gold_amount >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  -- Prevents duplicate daily reward claims per user per day.
  constraint daily_reward_claims_unique_per_day unique (user_id, claim_date)
);

create index if not exists daily_reward_claims_user_date_idx
  on public.daily_reward_claims (user_id, claim_date desc);

create index if not exists daily_reward_claims_claim_date_idx
  on public.daily_reward_claims (claim_date desc);

create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_key text not null,
  unlocked_at timestamptz not null default timezone('utc', now()),
  -- Achievements are unique per user / key.
  constraint user_achievements_unique_per_user_key unique (user_id, achievement_key)
);

create index if not exists user_achievements_user_unlocked_idx
  on public.user_achievements (user_id, unlocked_at desc);

create index if not exists user_streaks_current_streak_idx
  on public.user_streaks (current_streak desc, last_claim_date desc);

-- ---------------------------------------------------------------------------
-- Constraint extensions (additive only)
-- ---------------------------------------------------------------------------

-- Allow recording the daily reward credit in the existing wallet ledger.
alter table public.wallet_transactions
  drop constraint if exists wallet_transactions_transaction_type_check;

alter table public.wallet_transactions
  add constraint wallet_transactions_transaction_type_check
  check (
    transaction_type in (
      'top_up',
      'gift_sent',
      'gift_received',
      'message_charge',
      'profile_boost',
      'daily_reward',
      'adjustment'
    )
  );

-- Allow the optional daily reward notification type.
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
      'your_turn_reminder',
      'premium_expiring',
      'elite_near_level',
      'creator_goal_progress',
      'daily_reward_claimed'
    )
  );

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.user_streaks enable row level security;
alter table public.daily_reward_claims enable row level security;
alter table public.user_achievements enable row level security;

grant usage on schema public to authenticated;
grant select on public.user_streaks to authenticated;
grant select on public.daily_reward_claims to authenticated;
grant select on public.user_achievements to authenticated;

-- All writes flow through the security-definer RPC below. Clients can never
-- mutate Gold, streaks, claims or achievements directly.
revoke insert, update, delete on public.user_streaks from authenticated;
revoke insert, update, delete on public.daily_reward_claims from authenticated;
revoke insert, update, delete on public.user_achievements from authenticated;

drop policy if exists "Users can read their streak" on public.user_streaks;
drop policy if exists "Admins can read all streaks" on public.user_streaks;
drop policy if exists "Users can read their reward claims" on public.daily_reward_claims;
drop policy if exists "Admins can read all reward claims" on public.daily_reward_claims;
drop policy if exists "Users can read their achievements" on public.user_achievements;
drop policy if exists "Admins can read all achievements" on public.user_achievements;

create policy "Users can read their streak"
  on public.user_streaks
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Admins can read all streaks"
  on public.user_streaks
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

create policy "Users can read their reward claims"
  on public.daily_reward_claims
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Admins can read all reward claims"
  on public.daily_reward_claims
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

create policy "Users can read their achievements"
  on public.user_achievements
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Admins can read all achievements"
  on public.user_achievements
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- Reward schedule
-- Day 1: 5, Day 2: 6, Day 3: 7, Day 4: 8, Day 5: 10, Day 6: 12, Day 7+: 20
-- ---------------------------------------------------------------------------

create or replace function public.daily_reward_gold_for_day(streak_day integer)
returns integer
language sql
immutable
as $$
  select case
    when coalesce(streak_day, 1) <= 1 then 5
    when streak_day = 2 then 6
    when streak_day = 3 then 7
    when streak_day = 4 then 8
    when streak_day = 5 then 10
    when streak_day = 6 then 12
    else 20
  end;
$$;

-- ---------------------------------------------------------------------------
-- Daily reward claim (server-side, atomic, duplicate-safe)
-- ---------------------------------------------------------------------------

create or replace function public.claim_daily_reward()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid := auth.uid();
  today_date date := timezone('utc', now())::date;
  streak_row public.user_streaks%rowtype;
  previous_streak integer := 0;
  previous_last_claim date;
  longest integer := 0;
  new_streak integer;
  reward_gold integer;
  remaining_gold integer;
  claim_id uuid;
  total_claims integer;
  unlocked_achievements text[] := array[]::text[];
begin
  if target_user_id is null then
    raise exception 'not_authenticated';
  end if;

  -- Serialise concurrent claims for the same user.
  perform pg_advisory_xact_lock(hashtext('daily_reward:' || target_user_id::text));

  select *
  into streak_row
  from public.user_streaks
  where user_id = target_user_id;

  previous_streak := coalesce(streak_row.current_streak, 0);
  previous_last_claim := streak_row.last_claim_date;
  longest := coalesce(streak_row.longest_streak, 0);

  if previous_last_claim = today_date then
    raise exception 'already_claimed';
  end if;

  -- Continue the streak only when the previous claim was yesterday.
  if previous_last_claim = today_date - 1 then
    new_streak := previous_streak + 1;
  else
    new_streak := 1;
  end if;

  reward_gold := public.daily_reward_gold_for_day(new_streak);

  -- The unique (user_id, claim_date) constraint is the source of truth for
  -- duplicate prevention. Insert before crediting any Gold.
  insert into public.daily_reward_claims (
    user_id,
    claim_date,
    streak_day,
    gold_amount
  )
  values (target_user_id, today_date, new_streak, reward_gold)
  on conflict (user_id, claim_date) do nothing
  returning id into claim_id;

  if claim_id is null then
    raise exception 'already_claimed';
  end if;

  -- Credit Gold safely, creating the wallet row if it does not exist yet.
  insert into public.user_wallets (user_id, gold_balance)
  values (target_user_id, reward_gold)
  on conflict (user_id) do update
    set gold_balance = user_wallets.gold_balance + excluded.gold_balance,
        updated_at = timezone('utc', now())
  returning gold_balance into remaining_gold;

  -- Record the credit in the existing wallet ledger.
  insert into public.wallet_transactions (
    user_id,
    transaction_type,
    gold_delta,
    reference_type,
    reference_id
  )
  values (target_user_id, 'daily_reward', reward_gold, 'Daily reward', claim_id);

  longest := greatest(longest, new_streak);

  insert into public.user_streaks (
    user_id,
    current_streak,
    longest_streak,
    last_claim_date,
    updated_at
  )
  values (target_user_id, new_streak, longest, today_date, timezone('utc', now()))
  on conflict (user_id) do update
    set current_streak = excluded.current_streak,
        longest_streak = greatest(user_streaks.longest_streak, excluded.longest_streak),
        last_claim_date = excluded.last_claim_date,
        updated_at = timezone('utc', now());

  select count(*)
  into total_claims
  from public.daily_reward_claims
  where user_id = target_user_id;

  -- Achievements (unique per user/key, never re-awarded).
  if total_claims = 1 then
    insert into public.user_achievements (user_id, achievement_key)
    values (target_user_id, 'first_daily_reward')
    on conflict (user_id, achievement_key) do nothing;
    if found then
      unlocked_achievements := unlocked_achievements || 'first_daily_reward';
    end if;

    insert into public.user_achievements (user_id, achievement_key)
    values (target_user_id, 'first_gold_claim')
    on conflict (user_id, achievement_key) do nothing;
    if found then
      unlocked_achievements := unlocked_achievements || 'first_gold_claim';
    end if;
  end if;

  if new_streak >= 3 then
    insert into public.user_achievements (user_id, achievement_key)
    values (target_user_id, 'three_day_streak')
    on conflict (user_id, achievement_key) do nothing;
    if found then
      unlocked_achievements := unlocked_achievements || 'three_day_streak';
    end if;
  end if;

  if new_streak >= 7 then
    insert into public.user_achievements (user_id, achievement_key)
    values (target_user_id, 'seven_day_streak')
    on conflict (user_id, achievement_key) do nothing;
    if found then
      unlocked_achievements := unlocked_achievements || 'seven_day_streak';
    end if;
  end if;

  -- Optional, non-noisy notification (deduped to at most one per day).
  perform public.create_deduped_notification(
    target_user_id,
    'daily_reward_claimed',
    'Daily reward claimed',
    '+' || reward_gold || ' Gold added. Day ' || new_streak || ' streak.',
    null,
    jsonb_build_object(
      'route', '/wallet',
      'claim_date', today_date::text,
      'gold_amount', reward_gold,
      'streak_day', new_streak
    ),
    'claim_date',
    interval '20 hours'
  );

  return jsonb_build_object(
    'ok', true,
    'already_claimed', false,
    'gold_amount', reward_gold,
    'streak_day', new_streak,
    'current_streak', new_streak,
    'longest_streak', longest,
    'remaining_gold', remaining_gold,
    'unlocked_achievements', to_jsonb(unlocked_achievements)
  );
end;
$$;

revoke all on function public.claim_daily_reward() from public;
grant execute on function public.claim_daily_reward() to authenticated;
