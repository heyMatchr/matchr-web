create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists moderation_score integer not null default 0,
  add column if not exists shadow_restricted boolean not null default false,
  add column if not exists discover_hidden boolean not null default false,
  add column if not exists under_review boolean not null default false,
  add column if not exists messaging_limited boolean not null default false,
  add column if not exists calls_limited boolean not null default false,
  add column if not exists trusted_user boolean not null default false,
  add column if not exists risk_level text not null default 'low';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_risk_level_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_risk_level_check
      check (risk_level in ('low', 'medium', 'high', 'critical'));
  end if;
end;
$$;

create table if not exists public.moderation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  amount integer not null default 1,
  source text not null default 'system',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.media_moderation_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  source_id uuid,
  media_url text,
  status text not null default 'pending',
  flags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'media_moderation_checks_status_check'
      and conrelid = 'public.media_moderation_checks'::regclass
  ) then
    alter table public.media_moderation_checks
      add constraint media_moderation_checks_status_check
      check (status in ('pending', 'passed', 'flagged', 'failed'));
  end if;
end;
$$;

create index if not exists moderation_events_user_created_idx
  on public.moderation_events (user_id, created_at desc);

create index if not exists media_moderation_checks_user_created_idx
  on public.media_moderation_checks (user_id, created_at desc);

create index if not exists media_moderation_checks_status_created_idx
  on public.media_moderation_checks (status, created_at desc);

alter table public.moderation_events enable row level security;
alter table public.media_moderation_checks enable row level security;

grant usage on schema public to authenticated;
grant select on public.moderation_events to authenticated;
grant select, insert on public.media_moderation_checks to authenticated;

drop policy if exists "Users can read their moderation events" on public.moderation_events;
drop policy if exists "Users can read their media checks" on public.media_moderation_checks;
drop policy if exists "Users can create their media checks" on public.media_moderation_checks;

create policy "Users can read their moderation events"
  on public.moderation_events
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can read their media checks"
  on public.media_moderation_checks
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can create their media checks"
  on public.media_moderation_checks
  for insert
  to authenticated
  with check (user_id = auth.uid());

create or replace function public.apply_moderation_thresholds(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  score integer;
  next_risk_level text;
begin
  select moderation_score
  into score
  from public.profiles
  where id = target_user_id;

  if score is null then
    return;
  end if;

  next_risk_level := case
    when score >= 40 then 'critical'
    when score >= 30 then 'high'
    when score >= 10 then 'medium'
    else 'low'
  end;

  update public.profiles
  set
    under_review = under_review or score >= 10,
    discover_hidden = discover_hidden or score >= 20,
    messaging_limited = messaging_limited or score >= 30,
    shadow_restricted = shadow_restricted or score >= 40,
    calls_limited = calls_limited or score >= 40,
    risk_level = next_risk_level
  where id = target_user_id
    and trusted_user = false;
end;
$$;

create or replace function public.apply_moderation_penalty(
  target_user_id uuid,
  reason text,
  amount integer default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_user_id is null or amount <= 0 then
    return;
  end if;

  insert into public.moderation_events (user_id, reason, amount, source)
  values (target_user_id, reason, amount, 'system');

  update public.profiles
  set moderation_score = greatest(0, coalesce(moderation_score, 0) + amount)
  where id = target_user_id
    and trusted_user = false;

  perform public.apply_moderation_thresholds(target_user_id);
end;
$$;

create or replace function public.apply_self_moderation_penalty(
  reason text,
  amount integer default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.apply_moderation_penalty(auth.uid(), reason, amount);
end;
$$;

revoke all on function public.apply_moderation_thresholds(uuid) from public;
revoke all on function public.apply_moderation_penalty(uuid, text, integer) from public;
revoke all on function public.apply_self_moderation_penalty(text, integer) from public;
grant execute on function public.apply_self_moderation_penalty(text, integer) to authenticated;

create or replace function public.apply_report_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  recent_report_count integer;
  penalty_amount integer;
begin
  target_id := coalesce(new.target_user_id, new.reported_user_id);

  if target_id is null then
    return new;
  end if;

  select count(*)
  into recent_report_count
  from public.reports
  where coalesce(target_user_id, reported_user_id) = target_id
    and created_at >= timezone('utc', now()) - interval '24 hours';

  penalty_amount := case
    when lower(new.reason) like '%hate%' then 3
    when lower(new.reason) like '%underage%' then 3
    when lower(new.reason) like '%harassment%' then 2
    when lower(new.reason) like '%abusive%' then 2
    when recent_report_count >= 3 then 2
    else 1
  end;

  perform public.apply_moderation_penalty(
    target_id,
    'report:' || lower(replace(new.reason, ' ', '_')),
    penalty_amount
  );

  return new;
end;
$$;

drop trigger if exists apply_report_moderation_trigger on public.reports;

create trigger apply_report_moderation_trigger
  after insert on public.reports
  for each row
  execute function public.apply_report_moderation();

-- Future scaling notes:
-- 1. media_moderation_checks is a placeholder for image/video NSFW, abuse,
--    and identity-targeted harassment scanning.
-- 2. shadow_restricted/discover_hidden/risk_level enable softer visibility
--    controls before hard bans.
-- 3. moderation_events gives support/admin tooling a lightweight audit trail.
