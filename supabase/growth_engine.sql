create extension if not exists pgcrypto;

create table if not exists public.referral_codes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.referral_events (
  id uuid primary key default gen_random_uuid(),
  inviter_user_id uuid references public.profiles(id) on delete set null,
  referred_user_id uuid references public.profiles(id) on delete set null,
  referral_code text,
  event_type text not null,
  source text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint referral_events_type_check check (
    event_type in ('invite_sent', 'join')
  )
);

create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  inviter_user_id uuid not null references public.profiles(id) on delete cascade,
  referred_user_id uuid not null references public.profiles(id) on delete cascade,
  gold_amount integer not null default 25,
  status text not null default 'earned',
  created_at timestamptz not null default timezone('utc', now()),
  paid_at timestamptz,
  constraint referral_rewards_gold_amount_check check (gold_amount > 0),
  constraint referral_rewards_status_check check (
    status in ('earned', 'paid', 'cancelled')
  ),
  constraint referral_rewards_unique_pair unique (
    inviter_user_id,
    referred_user_id
  )
);

create index if not exists referral_events_inviter_created_idx
  on public.referral_events (inviter_user_id, created_at desc);

create index if not exists referral_events_referred_idx
  on public.referral_events (referred_user_id);

create index if not exists referral_rewards_inviter_created_idx
  on public.referral_rewards (inviter_user_id, created_at desc);

create index if not exists referral_rewards_status_created_idx
  on public.referral_rewards (status, created_at desc);

alter table public.referral_codes enable row level security;
alter table public.referral_events enable row level security;
alter table public.referral_rewards enable row level security;

drop policy if exists "Users can read their referral code" on public.referral_codes;
drop policy if exists "Users can read referral events" on public.referral_events;
drop policy if exists "Users can read referral rewards" on public.referral_rewards;

create policy "Users can read their referral code"
  on public.referral_codes
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can read referral events"
  on public.referral_events
  for select
  to authenticated
  using (
    inviter_user_id = auth.uid()
    or referred_user_id = auth.uid()
  );

create policy "Users can read referral rewards"
  on public.referral_rewards
  for select
  to authenticated
  using (
    inviter_user_id = auth.uid()
    or referred_user_id = auth.uid()
  );

create or replace function public.ensure_referral_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid := auth.uid();
  existing_code text;
  generated_code text;
begin
  if target_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select code
  into existing_code
  from public.referral_codes
  where user_id = target_user_id;

  if existing_code is not null then
    return existing_code;
  end if;

  loop
    generated_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

    begin
      insert into public.referral_codes (user_id, code)
      values (target_user_id, generated_code);

      return generated_code;
    exception
      when unique_violation then
        -- Try again if an unlikely code collision occurs.
    end;
  end loop;
end;
$$;

create or replace function public.record_referral_invite(invite_source text default 'copy')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid := auth.uid();
  invite_code text;
begin
  if target_user_id is null then
    raise exception 'not_authenticated';
  end if;

  invite_code := public.ensure_referral_code();

  insert into public.referral_events (
    inviter_user_id,
    referral_code,
    event_type,
    source
  )
  values (
    target_user_id,
    invite_code,
    'invite_sent',
    coalesce(nullif(invite_source, ''), 'copy')
  );

  return jsonb_build_object(
    'code',
    invite_code,
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
  on conflict (inviter_user_id, referred_user_id) do nothing;

  return jsonb_build_object(
    'gold_amount',
    reward_amount,
    'inviter_user_id',
    inviter_id,
    'ok',
    true
  );
end;
$$;

revoke all on function public.ensure_referral_code() from public;
revoke all on function public.record_referral_invite(text) from public;
revoke all on function public.record_referral_join(text, uuid) from public;

grant execute on function public.ensure_referral_code() to authenticated;
grant execute on function public.record_referral_invite(text) to authenticated;
grant execute on function public.record_referral_join(text, uuid) to anon, authenticated;
