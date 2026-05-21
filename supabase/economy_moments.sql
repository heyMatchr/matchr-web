create extension if not exists pgcrypto;

alter table public.moments
  add column if not exists hide_likes boolean not null default false;

create table if not exists public.user_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  gold_balance integer not null default 0 check (gold_balance >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.gold_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  gold_amount integer not null check (gold_amount > 0),
  price_usd numeric(8, 2) not null check (price_usd > 0),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.message_charges (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  gold_cost integer not null check (gold_cost > 0),
  created_at timestamptz not null default timezone('utc', now()),
  constraint message_charges_no_self check (sender_id <> receiver_id)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_name text not null,
  status text not null default 'inactive',
  price_usd numeric(8, 2) not null,
  interval text not null,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz
);

alter table public.gift_transactions
  add column if not exists gold_cost integer;

update public.gift_transactions
set gold_cost = coin_price
where gold_cost is null;

alter table public.gift_transactions
  alter column gold_cost set default 0;

insert into public.gold_packages (name, gold_amount, price_usd)
select '$4.99 Gold Pack', 500, 4.99
where not exists (
  select 1 from public.gold_packages where name = '$4.99 Gold Pack'
);

insert into public.gifts_catalog (gift_type, name, icon, coin_price)
values
  ('rose', 'Rose', '🌹', 5),
  ('kiss', 'Kiss', '💋', 10),
  ('diamond', 'Diamond', '💎', 20),
  ('crown', 'Crown', '👑', 40)
on conflict (gift_type) do update
set
  name = excluded.name,
  icon = excluded.icon,
  coin_price = excluded.coin_price,
  active = true;

update public.gifts_catalog
set active = false
where gift_type not in ('rose', 'kiss', 'diamond', 'crown');

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
        'low_gold'
      )
    );
end;
$$;

create index if not exists moments_user_hide_likes_idx
  on public.moments (user_id, hide_likes);

create index if not exists message_charges_sender_created_idx
  on public.message_charges (sender_id, created_at desc);

create index if not exists subscriptions_user_status_idx
  on public.subscriptions (user_id, status, expires_at);

alter table public.user_wallets enable row level security;
alter table public.gold_packages enable row level security;
alter table public.message_charges enable row level security;
alter table public.subscriptions enable row level security;

grant usage on schema public to authenticated;
grant select, insert on public.user_wallets to authenticated;
grant select on public.gold_packages to authenticated;
grant select, insert on public.message_charges to authenticated;
grant select on public.subscriptions to authenticated;
grant select, insert on public.gift_transactions to authenticated;

drop policy if exists "Users can read their wallet" on public.user_wallets;
drop policy if exists "Users can create their wallet" on public.user_wallets;
drop policy if exists "Authenticated users can read gold packages" on public.gold_packages;
drop policy if exists "Users can read their message charges" on public.message_charges;
drop policy if exists "Users can create sent message charges" on public.message_charges;
drop policy if exists "Users can read their subscriptions" on public.subscriptions;
drop policy if exists "Users can update their moments" on public.moments;

create policy "Users can read their wallet"
  on public.user_wallets
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can create their wallet"
  on public.user_wallets
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Authenticated users can read gold packages"
  on public.gold_packages
  for select
  to authenticated
  using (true);

create policy "Users can read their message charges"
  on public.message_charges
  for select
  to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid());

create policy "Users can create sent message charges"
  on public.message_charges
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and sender_id <> receiver_id
    and not public.users_are_blocked(sender_id, receiver_id)
  );

create policy "Users can read their subscriptions"
  on public.subscriptions
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can update their moments"
  on public.moments
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'moment_comments'
  ) then
    alter publication supabase_realtime add table public.moment_comments;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'moment_likes'
  ) then
    alter publication supabase_realtime add table public.moment_likes;
  end if;
end;
$$;
