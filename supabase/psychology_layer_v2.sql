-- Psychology Layer V2
-- Conversation streaks (per match), global achievements (reuses user_achievements),
-- milestone notifications, and notification types for at-risk reminders.
--
-- Additive only. Does NOT touch: private media viewer/API, gifts economy,
-- wallet payment logic, Paystack, Gold purchase flow, or the daily reward
-- claim function.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Conversation streak: one shared row per match (both participants).
-- ---------------------------------------------------------------------------

create table if not exists public.conversation_streaks (
  match_id uuid primary key references public.matches(id) on delete cascade,
  current_streak integer not null default 0 check (current_streak >= 0),
  best_streak integer not null default 0 check (best_streak >= 0),
  last_mutual_date date,
  last_message_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint conversation_streaks_best_check check (best_streak >= current_streak)
);

create index if not exists conversation_streaks_active_idx
  on public.conversation_streaks (current_streak desc, last_mutual_date desc);

-- Speeds up the trigger's "did the other participant message today?" lookup.
create index if not exists messages_match_sender_created_idx
  on public.messages (match_id, sender_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Notification types (additive: full current list + two new V2 types).
-- ---------------------------------------------------------------------------

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
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
    'daily_reward_claimed',
    'conversation_streak_milestone',
    'conversation_streak_at_risk'
  )
);

-- ---------------------------------------------------------------------------
-- Row level security: participants read their own match's streak; admins all.
-- All writes flow through the security-definer trigger below.
-- ---------------------------------------------------------------------------

alter table public.conversation_streaks enable row level security;

grant usage on schema public to authenticated;
grant select on public.conversation_streaks to authenticated;
revoke insert, update, delete on public.conversation_streaks from authenticated;

drop policy if exists "Participants can read their conversation streak"
  on public.conversation_streaks;
drop policy if exists "Admins can read all conversation streaks"
  on public.conversation_streaks;

create policy "Participants can read their conversation streak"
  on public.conversation_streaks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.matches m
      where m.id = conversation_streaks.match_id
        and (m.user_one_id = auth.uid() or m.user_two_id = auth.uid())
    )
  );

create policy "Admins can read all conversation streaks"
  on public.conversation_streaks
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- Global achievements (reuses public.user_achievements) + milestone notice.
-- ---------------------------------------------------------------------------

create or replace function public.award_conversation_streak_milestone(
  participant_one uuid,
  participant_two uuid,
  related_match_id uuid,
  streak_days integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  achievement_key text;
  dedupe_value text;
  streak_metadata jsonb;
begin
  if streak_days not in (3, 7, 14, 30) then
    return;
  end if;

  achievement_key := 'conversation_streak_' || streak_days;

  -- Global, per-user achievement (unlocked the first time with anyone).
  insert into public.user_achievements (user_id, achievement_key)
  values (participant_one, achievement_key), (participant_two, achievement_key)
  on conflict (user_id, achievement_key) do nothing;

  dedupe_value := related_match_id::text || ':' || streak_days;
  streak_metadata := jsonb_build_object(
    'match_id', related_match_id::text,
    'route', '/chat/' || related_match_id::text,
    'streak_day', streak_days,
    'streak_dedupe', dedupe_value
  );

  -- Notify both participants. Actor is the other participant, which also
  -- satisfies create_deduped_notification's auth guard inside the trigger.
  perform public.create_deduped_notification(
    participant_one,
    'conversation_streak_milestone',
    'Conversation streak',
    streak_days || '-day streak. Keep it going.',
    participant_two,
    streak_metadata,
    'streak_dedupe',
    interval '7 days'
  );

  perform public.create_deduped_notification(
    participant_two,
    'conversation_streak_milestone',
    'Conversation streak',
    streak_days || '-day streak. Keep it going.',
    participant_one,
    streak_metadata,
    'streak_dedupe',
    interval '7 days'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- AFTER INSERT trigger on messages: extend the conversation streak when both
-- participants have sent a genuine message on the same UTC day.
-- ---------------------------------------------------------------------------

create or replace function public.update_conversation_streak()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (timezone('utc', now()))::date;
  v_user_one uuid;
  v_user_two uuid;
  v_other uuid;
  v_other_today boolean;
  v_prev_streak integer;
  v_prev_best integer;
  v_prev_date date;
  v_new_streak integer;
begin
  -- Allow-list of genuine conversation messages. This inherently excludes all
  -- system/event types (story_reply, story_reaction, story_gift, gift_reaction,
  -- private_media_opened, private_media_expired, call_event).
  if new.message_type not in (
    'text', 'image', 'video', 'voice', 'gift', 'private_media'
  ) then
    return new;
  end if;

  select user_one_id, user_two_id
  into v_user_one, v_user_two
  from public.matches
  where id = new.match_id;

  if v_user_one is null then
    return new;
  end if;

  v_other := case
    when new.sender_id = v_user_one then v_user_two
    else v_user_one
  end;

  -- Serialise concurrent inserts for the same match.
  perform pg_advisory_xact_lock(
    hashtext('conversation_streak:' || new.match_id::text)
  );

  select current_streak, best_streak, last_mutual_date
  into v_prev_streak, v_prev_best, v_prev_date
  from public.conversation_streaks
  where match_id = new.match_id;

  -- Has the other participant also sent a qualifying message today?
  select exists (
    select 1
    from public.messages m
    where m.match_id = new.match_id
      and m.sender_id = v_other
      and m.message_type in (
        'text', 'image', 'video', 'voice', 'gift', 'private_media'
      )
      and (timezone('utc', m.created_at))::date = v_today
  ) into v_other_today;

  -- Mutual day not achieved yet: only record recency / ensure the row exists.
  if not v_other_today then
    insert into public.conversation_streaks (
      match_id, current_streak, best_streak, last_mutual_date, last_message_at
    )
    values (
      new.match_id,
      coalesce(v_prev_streak, 0),
      coalesce(v_prev_best, 0),
      v_prev_date,
      new.created_at
    )
    on conflict (match_id) do update
      set last_message_at = greatest(
            coalesce(public.conversation_streaks.last_message_at, new.created_at),
            new.created_at
          ),
          updated_at = timezone('utc', now());
    return new;
  end if;

  -- Already counted a mutual day today: just touch recency.
  if v_prev_date = v_today then
    update public.conversation_streaks
      set last_message_at = greatest(
            coalesce(last_message_at, new.created_at),
            new.created_at
          ),
          updated_at = timezone('utc', now())
      where match_id = new.match_id;
    return new;
  end if;

  -- New mutual day: continue the streak only if yesterday was also mutual.
  if v_prev_date = v_today - 1 then
    v_new_streak := coalesce(v_prev_streak, 0) + 1;
  else
    v_new_streak := 1;
  end if;

  insert into public.conversation_streaks (
    match_id, current_streak, best_streak, last_mutual_date, last_message_at
  )
  values (
    new.match_id,
    v_new_streak,
    greatest(coalesce(v_prev_best, 0), v_new_streak),
    v_today,
    new.created_at
  )
  on conflict (match_id) do update
    set current_streak = excluded.current_streak,
        best_streak = greatest(
          public.conversation_streaks.best_streak,
          excluded.best_streak
        ),
        last_mutual_date = excluded.last_mutual_date,
        last_message_at = greatest(
          coalesce(public.conversation_streaks.last_message_at, excluded.last_message_at),
          excluded.last_message_at
        ),
        updated_at = timezone('utc', now());

  perform public.award_conversation_streak_milestone(
    v_user_one, v_user_two, new.match_id, v_new_streak
  );

  return new;
end;
$$;

drop trigger if exists update_conversation_streak_trigger on public.messages;
create trigger update_conversation_streak_trigger
  after insert on public.messages
  for each row
  execute function public.update_conversation_streak();

revoke all on function public.update_conversation_streak() from public;
revoke all on function public.award_conversation_streak_milestone(
  uuid, uuid, uuid, integer
) from public;
