create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists moderation_score integer not null default 0,
  add column if not exists under_review boolean not null default false,
  add column if not exists shadow_restricted boolean not null default false,
  add column if not exists discover_hidden boolean not null default false,
  add column if not exists messaging_limited boolean not null default false,
  add column if not exists calls_limited boolean not null default false,
  add column if not exists trusted_user boolean not null default false;

revoke update (
  moderation_score,
  under_review,
  shadow_restricted,
  discover_hidden,
  messaging_limited,
  calls_limited,
  trusted_user
) on public.profiles from authenticated;

create or replace function public.apply_moderation_thresholds(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  score integer;
begin
  select moderation_score
  into score
  from public.profiles
  where id = target_user_id;

  if score is null then
    return;
  end if;

  update public.profiles
  set
    under_review = under_review or score >= 10,
    discover_hidden = discover_hidden or score >= 20,
    messaging_limited = messaging_limited or score >= 30,
    shadow_restricted = shadow_restricted or score >= 40,
    calls_limited = calls_limited or score >= 40
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

  perform public.apply_moderation_penalty(
    target_id,
    'report',
    case when recent_report_count >= 3 then 2 else 1 end
  );

  return new;
end;
$$;

drop trigger if exists apply_report_moderation_trigger on public.reports;

create trigger apply_report_moderation_trigger
  after insert on public.reports
  for each row
  execute function public.apply_report_moderation();

create or replace function public.apply_block_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_block_count integer;
begin
  select count(*)
  into recent_block_count
  from public.blocks
  where blocked_user_id = new.blocked_user_id
    and created_at >= timezone('utc', now()) - interval '24 hours';

  if recent_block_count >= 3 then
    perform public.apply_moderation_penalty(
      new.blocked_user_id,
      'excessive_blocks',
      2
    );
  end if;

  return new;
end;
$$;

drop trigger if exists apply_block_moderation_trigger on public.blocks;

create trigger apply_block_moderation_trigger
  after insert on public.blocks
  for each row
  execute function public.apply_block_moderation();
