create extension if not exists pgcrypto;

create or replace function public.call_user_is_limited(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = target_user_id
      and coalesce(trusted_user, false) = false
      and (
        coalesce(calls_limited, false)
        or coalesce(shadow_restricted, false)
      )
  );
$$;

create or replace function public.call_participant_peer(
  target_call public.call_sessions
)
returns uuid
language sql
stable
as $$
  select case
    when target_call.caller_id = auth.uid() then target_call.receiver_id
    when target_call.receiver_id = auth.uid() then target_call.caller_id
    else null
  end;
$$;

create or replace function public.start_call(
  receiver_user_id uuid,
  active_match_id uuid,
  requested_call_type text default 'audio'
)
returns public.call_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_user_id uuid := auth.uid();
  normalized_call_type text;
  existing_call public.call_sessions%rowtype;
  saved_call public.call_sessions%rowtype;
begin
  if caller_user_id is null then
    raise exception 'not_authenticated';
  end if;

  normalized_call_type := case
    when requested_call_type = 'video' then 'video'
    else 'audio'
  end;

  if caller_user_id = receiver_user_id then
    raise exception 'invalid_receiver';
  end if;

  if public.users_are_blocked(caller_user_id, receiver_user_id) then
    raise exception 'blocked';
  end if;

  if public.call_user_is_limited(caller_user_id)
    or public.call_user_is_limited(receiver_user_id) then
    raise exception 'calls_unavailable';
  end if;

  if not exists (
    select 1
    from public.matches
    where matches.id = active_match_id
      and (
        (
          matches.user_one_id = caller_user_id
          and matches.user_two_id = receiver_user_id
        )
        or
        (
          matches.user_two_id = caller_user_id
          and matches.user_one_id = receiver_user_id
        )
      )
  ) then
    raise exception 'not_matched';
  end if;

  select *
  into existing_call
  from public.call_sessions
  where match_id = active_match_id
    and status in ('ringing', 'accepted')
    and (
      caller_id in (caller_user_id, receiver_user_id)
      or receiver_id in (caller_user_id, receiver_user_id)
    )
  order by created_at desc
  limit 1;

  if existing_call.id is not null then
    return existing_call;
  end if;

  insert into public.call_sessions (
    caller_id,
    receiver_id,
    match_id,
    call_type,
    status,
    connection_state
  )
  values (
    caller_user_id,
    receiver_user_id,
    active_match_id,
    normalized_call_type,
    'ringing',
    'ringing'
  )
  returning * into saved_call;

  insert into public.messages (
    content,
    match_id,
    message_type,
    receiver_id,
    sender_id
  )
  values (
    case when normalized_call_type = 'video' then 'Video call started.' else 'Audio call started.' end,
    active_match_id,
    'call_event',
    receiver_user_id,
    caller_user_id
  );

  insert into public.notifications (
    actor_id,
    body,
    metadata,
    title,
    type,
    user_id
  )
  values (
    caller_user_id,
    concat('Incoming ', normalized_call_type, ' call.'),
    jsonb_build_object(
      'call_id', saved_call.id,
      'call_type', normalized_call_type,
      'match_id', active_match_id
    ),
    concat('Incoming ', case when normalized_call_type = 'video' then 'video' else 'audio' end, ' call'),
    'incoming_call',
    receiver_user_id
  );

  return saved_call;
end;
$$;

create or replace function public.accept_call(target_call_id uuid)
returns public.call_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  target_call public.call_sessions%rowtype;
  saved_call public.call_sessions%rowtype;
begin
  if actor_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into target_call
  from public.call_sessions
  where id = target_call_id;

  if target_call.id is null or target_call.receiver_id <> actor_user_id then
    raise exception 'call_not_found';
  end if;

  if target_call.status = 'accepted' then
    return target_call;
  end if;

  if target_call.status <> 'ringing' then
    raise exception 'invalid_call_transition';
  end if;

  if public.users_are_blocked(target_call.caller_id, target_call.receiver_id)
    or public.call_user_is_limited(target_call.caller_id)
    or public.call_user_is_limited(target_call.receiver_id) then
    raise exception 'calls_unavailable';
  end if;

  update public.call_sessions
  set
    accepted_at = coalesce(accepted_at, timezone('utc', now())),
    connection_state = 'connected',
    started_at = coalesce(started_at, timezone('utc', now())),
    status = 'accepted'
  where id = target_call_id
    and status = 'ringing'
  returning * into saved_call;

  if saved_call.id is null then
    select * into saved_call from public.call_sessions where id = target_call_id;

    if saved_call.status = 'accepted' then
      return saved_call;
    end if;

    raise exception 'invalid_call_transition';
  end if;

  return saved_call;
end;
$$;

create or replace function public.decline_call(target_call_id uuid)
returns public.call_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  target_call public.call_sessions%rowtype;
  saved_call public.call_sessions%rowtype;
begin
  if actor_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into target_call
  from public.call_sessions
  where id = target_call_id;

  if target_call.id is null or target_call.receiver_id <> actor_user_id then
    raise exception 'call_not_found';
  end if;

  if target_call.status = 'declined' then
    return target_call;
  end if;

  if target_call.status <> 'ringing' then
    raise exception 'invalid_call_transition';
  end if;

  update public.call_sessions
  set
    connection_state = 'ended',
    ended_at = coalesce(ended_at, timezone('utc', now())),
    ended_reason = coalesce(ended_reason, 'declined'),
    status = 'declined'
  where id = target_call_id
    and status = 'ringing'
  returning * into saved_call;

  if saved_call.id is null then
    select * into saved_call from public.call_sessions where id = target_call_id;

    if saved_call.status = 'declined' then
      return saved_call;
    end if;

    raise exception 'invalid_call_transition';
  end if;

  return saved_call;
end;
$$;

create or replace function public.end_call(target_call_id uuid)
returns public.call_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  target_call public.call_sessions%rowtype;
  saved_call public.call_sessions%rowtype;
  peer_user_id uuid;
begin
  if actor_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into target_call
  from public.call_sessions
  where id = target_call_id;

  peer_user_id := public.call_participant_peer(target_call);

  if target_call.id is null or peer_user_id is null then
    raise exception 'call_not_found';
  end if;

  if target_call.status = 'ended' then
    return target_call;
  end if;

  if target_call.status <> 'accepted' then
    raise exception 'invalid_call_transition';
  end if;

  update public.call_sessions
  set
    connection_state = 'ended',
    ended_at = coalesce(ended_at, timezone('utc', now())),
    ended_reason = coalesce(ended_reason, 'ended_by_user'),
    status = 'ended'
  where id = target_call_id
    and status = 'accepted'
  returning * into saved_call;

  if saved_call.id is null then
    select * into saved_call from public.call_sessions where id = target_call_id;

    if saved_call.status = 'ended' then
      return saved_call;
    end if;

    raise exception 'invalid_call_transition';
  end if;

  insert into public.messages (
    content,
    match_id,
    message_type,
    receiver_id,
    sender_id
  )
  values (
    case when saved_call.call_type = 'video' then 'Video call ended.' else 'Audio call ended.' end,
    saved_call.match_id,
    'call_event',
    peer_user_id,
    actor_user_id
  );

  return saved_call;
end;
$$;

create or replace function public.mark_call_missed(target_call_id uuid)
returns public.call_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid := auth.uid();
  target_call public.call_sessions%rowtype;
  saved_call public.call_sessions%rowtype;
begin
  if actor_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into target_call
  from public.call_sessions
  where id = target_call_id;

  if target_call.id is null
    or (
      target_call.caller_id <> actor_user_id
      and target_call.receiver_id <> actor_user_id
    ) then
    raise exception 'call_not_found';
  end if;

  if target_call.status = 'missed' then
    return target_call;
  end if;

  if target_call.status <> 'ringing' then
    raise exception 'invalid_call_transition';
  end if;

  update public.call_sessions
  set
    connection_state = 'ended',
    ended_at = coalesce(ended_at, timezone('utc', now())),
    ended_reason = coalesce(ended_reason, 'missed_timeout'),
    status = 'missed'
  where id = target_call_id
    and status = 'ringing'
  returning * into saved_call;

  if saved_call.id is null then
    select * into saved_call from public.call_sessions where id = target_call_id;

    if saved_call.status = 'missed' then
      return saved_call;
    end if;

    raise exception 'invalid_call_transition';
  end if;

  insert into public.messages (
    content,
    match_id,
    message_type,
    receiver_id,
    sender_id
  )
  values (
    concat('Missed ', saved_call.call_type, ' call.'),
    saved_call.match_id,
    'call_event',
    saved_call.receiver_id,
    saved_call.caller_id
  );

  insert into public.notifications (
    actor_id,
    body,
    metadata,
    title,
    type,
    user_id
  )
  values
    (
      saved_call.receiver_id,
      concat('Missed ', saved_call.call_type, ' call.'),
      jsonb_build_object(
        'call_id', saved_call.id,
        'call_type', saved_call.call_type,
        'match_id', saved_call.match_id
      ),
      'Missed call',
      'missed_call',
      saved_call.caller_id
    ),
    (
      saved_call.caller_id,
      concat(case when saved_call.call_type = 'video' then 'Video' else 'Audio' end, ' call was not answered.'),
      jsonb_build_object(
        'call_id', saved_call.id,
        'call_type', saved_call.call_type,
        'match_id', saved_call.match_id
      ),
      'Call not answered',
      'missed_call',
      saved_call.receiver_id
    );

  return saved_call;
end;
$$;

revoke insert, update on public.call_sessions from authenticated;

drop policy if exists "Matched users can start calls" on public.call_sessions;
drop policy if exists "Call participants can update calls" on public.call_sessions;

drop policy if exists "Users can read related calls" on public.call_sessions;
create policy "Users can read related calls"
  on public.call_sessions
  for select
  to authenticated
  using (caller_id = auth.uid() or receiver_id = auth.uid());

revoke all on function public.call_user_is_limited(uuid) from public;
revoke all on function public.call_participant_peer(public.call_sessions) from public;
revoke all on function public.start_call(uuid, uuid, text) from public;
revoke all on function public.accept_call(uuid) from public;
revoke all on function public.decline_call(uuid) from public;
revoke all on function public.end_call(uuid) from public;
revoke all on function public.mark_call_missed(uuid) from public;

grant execute on function public.start_call(uuid, uuid, text) to authenticated;
grant execute on function public.accept_call(uuid) to authenticated;
grant execute on function public.decline_call(uuid) to authenticated;
grant execute on function public.end_call(uuid) to authenticated;
grant execute on function public.mark_call_missed(uuid) to authenticated;
