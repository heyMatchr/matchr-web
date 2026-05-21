create extension if not exists pgcrypto;

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_type text not null check (order_type in ('gold', 'premium')),
  status text not null default 'pending' check (status in ('pending', 'checkout_placeholder', 'paid', 'cancelled', 'failed')),
  amount_usd numeric(8, 2) not null,
  gold_amount integer,
  plan_name text,
  stripe_checkout_session_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.premium_plans (
  id uuid primary key default gen_random_uuid(),
  plan_name text not null unique,
  price_usd numeric(8, 2) not null,
  interval text not null,
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.gold_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payment_order_id uuid references public.payment_orders(id) on delete set null,
  gold_amount integer not null check (gold_amount > 0),
  price_usd numeric(8, 2) not null,
  status text not null default 'pending',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.call_sessions (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  status text not null default 'ringing' check (status in ('ringing', 'accepted', 'declined', 'ended', 'missed')),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint call_sessions_no_self check (caller_id <> receiver_id)
);

insert into public.gold_packages (name, gold_amount, price_usd)
values
  ('500 Gold', 500, 4.99),
  ('1200 Gold', 1200, 9.99),
  ('3000 Gold', 3000, 19.99)
on conflict do nothing;

insert into public.premium_plans (plan_name, price_usd, interval, description)
values (
  'Matchr Premium',
  3.00,
  'week',
  'Cheaper messages, boosts, advanced filters, read insights, and priority discovery.'
)
on conflict (plan_name) do update
set
  price_usd = excluded.price_usd,
  interval = excluded.interval,
  description = excluded.description,
  active = true;

create index if not exists payment_orders_user_created_idx
  on public.payment_orders (user_id, created_at desc);

create index if not exists gold_purchases_user_created_idx
  on public.gold_purchases (user_id, created_at desc);

create index if not exists call_sessions_match_created_idx
  on public.call_sessions (match_id, created_at desc);

create index if not exists call_sessions_receiver_status_idx
  on public.call_sessions (receiver_id, status, created_at desc);

alter table public.payment_orders enable row level security;
alter table public.premium_plans enable row level security;
alter table public.gold_purchases enable row level security;
alter table public.call_sessions enable row level security;

grant usage on schema public to authenticated;
grant select, insert on public.payment_orders to authenticated;
grant select on public.premium_plans to authenticated;
grant select, insert on public.gold_purchases to authenticated;
grant select, insert, update on public.call_sessions to authenticated;

drop policy if exists "Users can read their payment orders" on public.payment_orders;
drop policy if exists "Users can create their payment orders" on public.payment_orders;
drop policy if exists "Authenticated users can read premium plans" on public.premium_plans;
drop policy if exists "Users can read their gold purchases" on public.gold_purchases;
drop policy if exists "Users can create their gold purchases" on public.gold_purchases;
drop policy if exists "Users can read related calls" on public.call_sessions;
drop policy if exists "Matched users can start calls" on public.call_sessions;
drop policy if exists "Call participants can update calls" on public.call_sessions;

create policy "Users can read their payment orders"
  on public.payment_orders for select to authenticated
  using (user_id = auth.uid());

create policy "Users can create their payment orders"
  on public.payment_orders for insert to authenticated
  with check (user_id = auth.uid());

create policy "Authenticated users can read premium plans"
  on public.premium_plans for select to authenticated
  using (active = true);

create policy "Users can read their gold purchases"
  on public.gold_purchases for select to authenticated
  using (user_id = auth.uid());

create policy "Users can create their gold purchases"
  on public.gold_purchases for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can read related calls"
  on public.call_sessions for select to authenticated
  using (caller_id = auth.uid() or receiver_id = auth.uid());

create policy "Matched users can start calls"
  on public.call_sessions for insert to authenticated
  with check (
    caller_id = auth.uid()
    and caller_id <> receiver_id
    and not public.users_are_blocked(caller_id, receiver_id)
    and exists (
      select 1 from public.matches
      where matches.id = call_sessions.match_id
        and (
          (matches.user_one_id = call_sessions.caller_id and matches.user_two_id = call_sessions.receiver_id)
          or
          (matches.user_two_id = call_sessions.caller_id and matches.user_one_id = call_sessions.receiver_id)
        )
    )
  );

create policy "Call participants can update calls"
  on public.call_sessions for update to authenticated
  using (caller_id = auth.uid() or receiver_id = auth.uid())
  with check (caller_id = auth.uid() or receiver_id = auth.uid());

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
        'premium_teaser',
        'incoming_call',
        'missed_call'
      )
    );

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'call_sessions'
  ) then
    alter publication supabase_realtime add table public.call_sessions;
  end if;
end;
$$;
