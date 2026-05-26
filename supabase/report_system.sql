create extension if not exists pgcrypto;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid references auth.users(id) on delete cascade,
  target_user_id uuid references auth.users(id) on delete cascade,
  target_story_id uuid references public.stories(id) on delete set null,
  target_moment_id uuid references public.moments(id) on delete set null,
  target_message_id uuid references public.messages(id) on delete set null,
  reason text not null,
  details text,
  status text not null default 'open',
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.reports
  add column if not exists reported_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists target_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists target_story_id uuid references public.stories(id) on delete set null,
  add column if not exists target_moment_id uuid references public.moments(id) on delete set null,
  add column if not exists target_message_id uuid references public.messages(id) on delete set null,
  add column if not exists details text,
  add column if not exists status text not null default 'open';

alter table public.reports
  alter column reported_user_id drop not null,
  alter column details drop not null,
  alter column status set default 'open';

update public.reports
set target_user_id = reported_user_id
where target_user_id is null
  and reported_user_id is not null;

alter table public.profiles
  add column if not exists under_review boolean not null default false,
  add column if not exists moderation_score integer not null default 0;

create index if not exists reports_reporter_created_idx
  on public.reports (reporter_id, created_at desc);

create index if not exists reports_target_user_created_idx
  on public.reports (target_user_id, created_at desc);

create index if not exists reports_target_story_idx
  on public.reports (target_story_id);

create index if not exists reports_target_moment_idx
  on public.reports (target_moment_id);

create index if not exists reports_target_message_idx
  on public.reports (target_message_id);

alter table public.reports enable row level security;

grant usage on schema public to authenticated;
grant select, insert on public.reports to authenticated;

drop policy if exists "Users can create reports" on public.reports;
drop policy if exists "Users can read their reports" on public.reports;

create policy "Users can create reports"
  on public.reports
  for insert
  to authenticated
  with check (
    auth.uid() = reporter_id
    and (
      target_user_id is null
      or auth.uid() <> target_user_id
    )
  );

create policy "Users can read their reports"
  on public.reports
  for select
  to authenticated
  using (auth.uid() = reporter_id);

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

  update public.profiles
  set moderation_score = coalesce(moderation_score, 0) + 1
  where id = target_id;

  select count(*)
  into recent_report_count
  from public.reports
  where coalesce(target_user_id, reported_user_id) = target_id
    and created_at >= timezone('utc', now()) - interval '24 hours';

  if recent_report_count >= 5 then
    update public.profiles
    set under_review = true
    where id = target_id;
  end if;

  return new;
end;
$$;

drop trigger if exists apply_report_moderation_trigger on public.reports;

create trigger apply_report_moderation_trigger
  after insert on public.reports
  for each row
  execute function public.apply_report_moderation();
