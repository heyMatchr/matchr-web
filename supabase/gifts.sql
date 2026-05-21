create extension if not exists pgcrypto;

create table if not exists public.gifts_catalog (
  id uuid primary key default gen_random_uuid(),
  gift_type text not null unique,
  name text not null,
  icon text not null,
  coin_price integer not null check (coin_price > 0),
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.gift_transactions (
  id uuid primary key default gen_random_uuid(),
  gift_type text not null references public.gifts_catalog(gift_type),
  coin_price integer not null check (coin_price > 0),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('chat', 'story', 'moment')),
  source_id uuid,
  message_id uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint gift_transactions_no_self check (sender_id <> receiver_id)
);

insert into public.gifts_catalog (gift_type, name, icon, coin_price)
values
  ('rose', 'Rose', '🌹', 5),
  ('kiss', 'Kiss', '💋', 10),
  ('diamond', 'Diamond', '💎', 25),
  ('crown', 'Crown', '👑', 50),
  ('private_flame', 'Private Flame', '🔥', 100)
on conflict (gift_type) do update
set
  name = excluded.name,
  icon = excluded.icon,
  coin_price = excluded.coin_price,
  active = true;

create index if not exists gift_transactions_receiver_created_idx
  on public.gift_transactions (receiver_id, created_at desc);

create index if not exists gift_transactions_sender_created_idx
  on public.gift_transactions (sender_id, created_at desc);

create index if not exists gift_transactions_source_idx
  on public.gift_transactions (source, source_id);

alter table public.gifts_catalog enable row level security;
alter table public.gift_transactions enable row level security;

grant usage on schema public to authenticated;
grant select on public.gifts_catalog to authenticated;
grant select, insert on public.gift_transactions to authenticated;

drop policy if exists "Authenticated users can read gift catalog" on public.gifts_catalog;
drop policy if exists "Users can create sent gift transactions" on public.gift_transactions;
drop policy if exists "Users can read related gift transactions" on public.gift_transactions;

create policy "Authenticated users can read gift catalog"
  on public.gifts_catalog
  for select
  to authenticated
  using (active = true);

create policy "Users can create sent gift transactions"
  on public.gift_transactions
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and sender_id <> receiver_id
    and not public.users_are_blocked(sender_id, receiver_id)
    and exists (
      select 1
      from public.gifts_catalog
      where gifts_catalog.gift_type = gift_transactions.gift_type
        and gifts_catalog.coin_price = gift_transactions.coin_price
        and gifts_catalog.active = true
    )
  );

create policy "Users can read related gift transactions"
  on public.gift_transactions
  for select
  to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid());

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'gift_transactions'
  ) then
    alter publication supabase_realtime add table public.gift_transactions;
  end if;
end;
$$;
