create extension if not exists pgcrypto;

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  private_profile boolean not null default false,
  hide_online_status boolean not null default false,
  hide_read_receipts boolean not null default false,
  hide_followers_count boolean not null default false,
  hide_following_count boolean not null default false,
  hide_moments_likes boolean not null default false,
  allow_story_replies boolean not null default true,
  allow_gifts boolean not null default true,
  allow_profile_views boolean not null default true,
  dm_permissions text not null default 'matches_only' check (dm_permissions in ('everyone', 'followers_only', 'matches_only')),
  show_in_discover boolean not null default true,
  distance_preference integer not null default 50,
  min_age_preference integer not null default 18,
  max_age_preference integer not null default 99,
  gender_preference text not null default 'any',
  relationship_intent_preference text,
  push_notifications boolean not null default false,
  story_notifications boolean not null default true,
  message_notifications boolean not null default true,
  gift_notifications boolean not null default true,
  match_notifications boolean not null default true,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.follow_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  requested_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint follow_requests_no_self check (requester_id <> requested_user_id),
  constraint follow_requests_unique_pair unique (requester_id, requested_user_id)
);

create table if not exists public.blocked_users (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint blocked_users_no_self check (blocker_id <> blocked_user_id),
  constraint blocked_users_unique_pair unique (blocker_id, blocked_user_id)
);

create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('spam', 'fake_profile', 'harassment', 'inappropriate_content', 'underage', 'scam_fraud', 'other')),
  details text not null default '' check (char_length(details) <= 1000),
  status text not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  constraint user_reports_no_self check (reporter_id <> reported_user_id)
);

create table if not exists public.muted_users (
  id uuid primary key default gen_random_uuid(),
  muter_id uuid not null references auth.users(id) on delete cascade,
  muted_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint muted_users_no_self check (muter_id <> muted_user_id),
  constraint muted_users_unique_pair unique (muter_id, muted_user_id)
);

create table if not exists public.hidden_users (
  id uuid primary key default gen_random_uuid(),
  hider_id uuid not null references auth.users(id) on delete cascade,
  hidden_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint hidden_users_no_self check (hider_id <> hidden_user_id),
  constraint hidden_users_unique_pair unique (hider_id, hidden_user_id)
);

create table if not exists public.premium_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_name text not null default 'Matchr Premium',
  status text not null default 'inactive',
  price_usd numeric(8, 2) not null default 3.00,
  interval text not null default 'week',
  perks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('top_up', 'gift_sent', 'gift_received', 'message_charge', 'adjustment')),
  gold_delta integer not null,
  reference_type text,
  reference_id uuid,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.moderation_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  content_type text not null,
  content_id uuid,
  flag_type text not null,
  severity integer not null default 1,
  status text not null default 'open',
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.messages
  add column if not exists is_sensitive boolean not null default false,
  add column if not exists sensitive_label text;

alter table public.moments
  add column if not exists is_sensitive boolean not null default false,
  add column if not exists sensitive_label text;

alter table public.stories
  add column if not exists is_sensitive boolean not null default false,
  add column if not exists sensitive_label text;

create index if not exists follow_requests_requested_status_idx
  on public.follow_requests (requested_user_id, status, created_at desc);

create index if not exists user_reports_reporter_created_idx
  on public.user_reports (reporter_id, created_at desc);

create index if not exists wallet_transactions_user_created_idx
  on public.wallet_transactions (user_id, created_at desc);

create index if not exists premium_subscriptions_user_status_idx
  on public.premium_subscriptions (user_id, status, expires_at);

alter table public.user_settings enable row level security;
alter table public.follow_requests enable row level security;
alter table public.blocked_users enable row level security;
alter table public.user_reports enable row level security;
alter table public.muted_users enable row level security;
alter table public.hidden_users enable row level security;
alter table public.premium_subscriptions enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.moderation_flags enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on public.user_settings to authenticated;
grant select, insert, update on public.follow_requests to authenticated;
grant select, insert on public.blocked_users to authenticated;
grant select, insert on public.user_reports to authenticated;
grant select, insert, delete on public.muted_users to authenticated;
grant select, insert, delete on public.hidden_users to authenticated;
grant select on public.premium_subscriptions to authenticated;
grant select on public.wallet_transactions to authenticated;
grant insert on public.moderation_flags to authenticated;

drop policy if exists "Users can read their settings" on public.user_settings;
drop policy if exists "Users can manage their settings" on public.user_settings;
drop policy if exists "Users can read related follow requests" on public.follow_requests;
drop policy if exists "Users can create follow requests" on public.follow_requests;
drop policy if exists "Users can update received follow requests" on public.follow_requests;
drop policy if exists "Users can read their blocked users" on public.blocked_users;
drop policy if exists "Users can create their blocked users" on public.blocked_users;
drop policy if exists "Users can read their user reports" on public.user_reports;
drop policy if exists "Users can create user reports" on public.user_reports;
drop policy if exists "Users can manage their muted users" on public.muted_users;
drop policy if exists "Users can manage their hidden users" on public.hidden_users;
drop policy if exists "Users can read their premium subscriptions" on public.premium_subscriptions;
drop policy if exists "Users can read their wallet transactions" on public.wallet_transactions;
drop policy if exists "Users can create moderation flags" on public.moderation_flags;

create policy "Users can read their settings"
  on public.user_settings for select to authenticated
  using (user_id = auth.uid());

create policy "Users can manage their settings"
  on public.user_settings for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can read related follow requests"
  on public.follow_requests for select to authenticated
  using (requester_id = auth.uid() or requested_user_id = auth.uid());

create policy "Users can create follow requests"
  on public.follow_requests for insert to authenticated
  with check (
    requester_id = auth.uid()
    and requester_id <> requested_user_id
    and not public.users_are_blocked(requester_id, requested_user_id)
  );

create policy "Users can update received follow requests"
  on public.follow_requests for update to authenticated
  using (requested_user_id = auth.uid() or requester_id = auth.uid())
  with check (requested_user_id = auth.uid() or requester_id = auth.uid());

create policy "Users can read their blocked users"
  on public.blocked_users for select to authenticated
  using (blocker_id = auth.uid());

create policy "Users can create their blocked users"
  on public.blocked_users for insert to authenticated
  with check (blocker_id = auth.uid() and blocker_id <> blocked_user_id);

create policy "Users can read their user reports"
  on public.user_reports for select to authenticated
  using (reporter_id = auth.uid());

create policy "Users can create user reports"
  on public.user_reports for insert to authenticated
  with check (reporter_id = auth.uid() and reporter_id <> reported_user_id);

create policy "Users can manage their muted users"
  on public.muted_users for all to authenticated
  using (muter_id = auth.uid())
  with check (muter_id = auth.uid() and muter_id <> muted_user_id);

create policy "Users can manage their hidden users"
  on public.hidden_users for all to authenticated
  using (hider_id = auth.uid())
  with check (hider_id = auth.uid() and hider_id <> hidden_user_id);

create policy "Users can read their premium subscriptions"
  on public.premium_subscriptions for select to authenticated
  using (user_id = auth.uid());

create policy "Users can read their wallet transactions"
  on public.wallet_transactions for select to authenticated
  using (user_id = auth.uid());

create policy "Users can create moderation flags"
  on public.moderation_flags for insert to authenticated
  with check (user_id = auth.uid() or user_id is null);

do $$
begin
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
        'premium_teaser'
      )
    );
end;
$$;
