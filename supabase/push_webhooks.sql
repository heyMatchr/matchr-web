create extension if not exists pg_net with schema extensions;
create extension if not exists pgcrypto;

create table if not exists public.push_webhook_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.push_delivery_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  source_id uuid not null,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint push_delivery_events_unique unique (event_type, source_id, recipient_id)
);

create index if not exists push_delivery_events_recipient_created_idx
  on public.push_delivery_events (recipient_id, created_at desc);

alter table public.push_webhook_config enable row level security;
alter table public.push_delivery_events enable row level security;

revoke all on public.push_webhook_config from authenticated;
revoke all on public.push_delivery_events from authenticated;

create or replace function public.dispatch_matchr_push_webhook(
  event_type text,
  event_record jsonb
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  webhook_url text;
  webhook_secret text;
begin
  select value into webhook_url
  from public.push_webhook_config
  where key = 'push_webhook_url';

  select value into webhook_secret
  from public.push_webhook_config
  where key = 'push_webhook_secret';

  if webhook_url is null or webhook_secret is null then
    return;
  end if;

  perform net.http_post(
    url := webhook_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-matchr-push-secret', webhook_secret
    ),
    body := jsonb_build_object(
      'event_type', event_type,
      'record', event_record
    ),
    timeout_milliseconds := 3000
  );
end;
$$;

create or replace function public.dispatch_message_push_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.dispatch_matchr_push_webhook(
    'message.created',
    to_jsonb(new)
  );
  return new;
end;
$$;

create or replace function public.dispatch_match_push_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.dispatch_matchr_push_webhook(
    'match.created',
    to_jsonb(new)
  );
  return new;
end;
$$;

create or replace function public.dispatch_missed_call_push_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'missed' and old.status is distinct from new.status then
    perform public.dispatch_matchr_push_webhook(
      'call.missed',
      to_jsonb(new)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists dispatch_message_push_webhook_trigger on public.messages;
create trigger dispatch_message_push_webhook_trigger
  after insert on public.messages
  for each row
  execute function public.dispatch_message_push_webhook();

drop trigger if exists dispatch_match_push_webhook_trigger on public.matches;
create trigger dispatch_match_push_webhook_trigger
  after insert on public.matches
  for each row
  execute function public.dispatch_match_push_webhook();

drop trigger if exists dispatch_missed_call_push_webhook_trigger on public.call_sessions;
create trigger dispatch_missed_call_push_webhook_trigger
  after update on public.call_sessions
  for each row
  execute function public.dispatch_missed_call_push_webhook();

-- After deploying, configure the webhook endpoint from SQL editor:
-- insert into public.push_webhook_config (key, value)
-- values
--   ('push_webhook_url', 'https://YOUR_DOMAIN/api/push/events'),
--   ('push_webhook_secret', 'YOUR_LONG_RANDOM_SECRET')
-- on conflict (key) do update set value = excluded.value, updated_at = timezone('utc', now());
