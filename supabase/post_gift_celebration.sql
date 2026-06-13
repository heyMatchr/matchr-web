create extension if not exists pgcrypto;

alter table public.messages
  drop constraint if exists messages_message_type_check;

alter table public.messages
  add constraint messages_message_type_check
  check (
    message_type in (
      'text',
      'image',
      'video',
      'voice',
      'gift',
      'private_media',
      'story_reply',
      'story_reaction',
      'story_gift',
      'gift_reaction',
      'private_media_opened',
      'private_media_expired',
      'call_event'
    )
  );

create table if not exists public.gift_reactions (
  id uuid primary key default gen_random_uuid(),
  gift_transaction_id uuid not null references public.gift_transactions(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint gift_reactions_type_check check (
    reaction_type in ('appreciate', 'thanks', 'wave', 'nice')
  ),
  constraint gift_reactions_unique_transaction unique (gift_transaction_id)
);

create table if not exists public.gift_analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  gift_transaction_id uuid references public.gift_transactions(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  sender_id uuid references public.profiles(id) on delete set null,
  receiver_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint gift_analytics_events_type_check check (
    event_type in (
      'gift_sent',
      'gift_reacted',
      'gift_reaction_rate',
      'gift_sender_returned'
    )
  )
);

create index if not exists gift_reactions_receiver_created_idx
  on public.gift_reactions (receiver_id, created_at desc);

create index if not exists gift_reactions_sender_created_idx
  on public.gift_reactions (sender_id, created_at desc);

create index if not exists gift_analytics_events_type_created_idx
  on public.gift_analytics_events (event_type, created_at desc);

create index if not exists gift_analytics_events_transaction_idx
  on public.gift_analytics_events (gift_transaction_id);

alter table public.gift_reactions enable row level security;
alter table public.gift_analytics_events enable row level security;

drop policy if exists "Users can read gift reactions they are part of" on public.gift_reactions;
drop policy if exists "Users can read gift analytics they are part of" on public.gift_analytics_events;

create policy "Users can read gift reactions they are part of"
  on public.gift_reactions
  for select
  to authenticated
  using (sender_id = auth.uid() or receiver_id = auth.uid());

create policy "Users can read gift analytics they are part of"
  on public.gift_analytics_events
  for select
  to authenticated
  using (
    actor_id = auth.uid()
    or sender_id = auth.uid()
    or receiver_id = auth.uid()
  );

create or replace function public.record_gift_analytics_event(
  selected_event_type text,
  selected_gift_transaction_id uuid default null,
  event_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  gift_record public.gift_transactions%rowtype;
  saved_event_id uuid;
begin
  if actor_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if selected_event_type not in (
    'gift_sent',
    'gift_reacted',
    'gift_reaction_rate',
    'gift_sender_returned'
  ) then
    raise exception 'invalid_gift_analytics_event';
  end if;

  if selected_gift_transaction_id is not null then
    select *
    into gift_record
    from public.gift_transactions
    where id = selected_gift_transaction_id;
  end if;

  insert into public.gift_analytics_events (
    event_type,
    gift_transaction_id,
    actor_id,
    sender_id,
    receiver_id,
    metadata
  )
  values (
    selected_event_type,
    selected_gift_transaction_id,
    actor_user_id,
    gift_record.sender_id,
    gift_record.receiver_id,
    coalesce(event_metadata, '{}'::jsonb)
  )
  returning id into saved_event_id;

  return jsonb_build_object(
    'event_id',
    saved_event_id,
    'ok',
    true
  );
end;
$$;

create or replace function public.react_to_gift(
  selected_gift_transaction_id uuid,
  selected_reaction_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  gift_record public.gift_transactions%rowtype;
  saved_reaction public.gift_reactions%rowtype;
begin
  if actor_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if selected_reaction_type not in ('appreciate', 'thanks', 'wave', 'nice') then
    raise exception 'invalid_gift_reaction';
  end if;

  select *
  into gift_record
  from public.gift_transactions
  where id = selected_gift_transaction_id;

  if gift_record.id is null then
    raise exception 'gift_not_found';
  end if;

  if gift_record.receiver_id <> actor_user_id then
    raise exception 'not_gift_receiver';
  end if;

  insert into public.gift_reactions (
    gift_transaction_id,
    sender_id,
    receiver_id,
    reaction_type
  )
  values (
    gift_record.id,
    gift_record.sender_id,
    gift_record.receiver_id,
    selected_reaction_type
  )
  on conflict (gift_transaction_id) do update
  set
    reaction_type = excluded.reaction_type,
    created_at = timezone('utc', now())
  returning * into saved_reaction;

  perform public.record_gift_analytics_event(
    'gift_reacted',
    gift_record.id,
    jsonb_build_object('reaction_type', selected_reaction_type)
  );

  perform public.record_gift_analytics_event(
    'gift_reaction_rate',
    gift_record.id,
    jsonb_build_object('reaction_type', selected_reaction_type)
  );

  return jsonb_build_object(
    'gift_transaction_id',
    gift_record.id,
    'reaction_id',
    saved_reaction.id,
    'reaction_type',
    saved_reaction.reaction_type,
    'sender_id',
    gift_record.sender_id,
    'receiver_id',
    gift_record.receiver_id,
    'source',
    gift_record.source,
    'source_id',
    gift_record.source_id,
    'ok',
    true
  );
end;
$$;

revoke all on function public.record_gift_analytics_event(text, uuid, jsonb) from public;
revoke all on function public.react_to_gift(uuid, text) from public;

grant execute on function public.record_gift_analytics_event(text, uuid, jsonb) to authenticated;
grant execute on function public.react_to_gift(uuid, text) to authenticated;
