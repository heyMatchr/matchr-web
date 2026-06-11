create extension if not exists pgcrypto;

create table if not exists public.gift_streaks (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  current_streak integer not null default 1,
  best_streak integer not null default 1,
  last_gift_date date not null default ((timezone('utc', now()))::date),
  last_gift_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint gift_streaks_no_self_check check (sender_id <> receiver_id),
  constraint gift_streaks_current_check check (current_streak > 0),
  constraint gift_streaks_best_check check (best_streak >= current_streak)
);

create unique index if not exists gift_streaks_sender_receiver_idx
  on public.gift_streaks (sender_id, receiver_id);

create index if not exists gift_streaks_receiver_current_idx
  on public.gift_streaks (receiver_id, current_streak desc, last_gift_at desc);

create index if not exists gift_streaks_sender_current_idx
  on public.gift_streaks (sender_id, current_streak desc, last_gift_at desc);

alter table public.gift_streaks enable row level security;

grant select on public.gift_streaks to authenticated;
revoke insert, update, delete on public.gift_streaks from authenticated;

drop policy if exists "Users can read related gift streaks" on public.gift_streaks;

create policy "Users can read related gift streaks"
  on public.gift_streaks
  for select
  to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid());

create or replace function public.record_gift_streak(receiver_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_user_id uuid := auth.uid();
  existing_streak public.gift_streaks%rowtype;
  today date := (timezone('utc', now()))::date;
  next_streak integer;
  saved_streak public.gift_streaks%rowtype;
begin
  if sender_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if receiver_user_id is null or sender_user_id = receiver_user_id then
    raise exception 'invalid_receiver';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(sender_user_id::text || ':' || receiver_user_id::text || ':gift_streak')
  );

  select *
  into existing_streak
  from public.gift_streaks
  where sender_id = sender_user_id
    and receiver_id = receiver_user_id
  limit 1;

  if existing_streak.id is null then
    insert into public.gift_streaks (
      sender_id,
      receiver_id,
      current_streak,
      best_streak,
      last_gift_date,
      last_gift_at
    )
    values (
      sender_user_id,
      receiver_user_id,
      1,
      1,
      today,
      timezone('utc', now())
    )
    returning * into saved_streak;
  elsif existing_streak.last_gift_date = today then
    saved_streak := existing_streak;
  else
    next_streak := case
      when existing_streak.last_gift_date = today - 1 then existing_streak.current_streak + 1
      else 1
    end;

    update public.gift_streaks
    set
      current_streak = next_streak,
      best_streak = greatest(existing_streak.best_streak, next_streak),
      last_gift_date = today,
      last_gift_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    where id = existing_streak.id
    returning * into saved_streak;
  end if;

  return jsonb_build_object(
    'current_streak',
    saved_streak.current_streak,
    'best_streak',
    saved_streak.best_streak,
    'last_gift_date',
    saved_streak.last_gift_date
  );
end;
$$;

revoke all on function public.record_gift_streak(uuid) from public;
grant execute on function public.record_gift_streak(uuid) to authenticated;
