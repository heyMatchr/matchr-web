create extension if not exists pgcrypto;

alter table public.call_sessions
  add column if not exists call_type text default 'audio',
  add column if not exists accepted_at timestamptz;

update public.call_sessions
set call_type = 'audio'
where call_type is null;

alter table public.call_sessions
  alter column call_type set default 'audio',
  alter column call_type set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'call_sessions_call_type_check'
      and conrelid = 'public.call_sessions'::regclass
  ) then
    alter table public.call_sessions
      add constraint call_sessions_call_type_check
      check (call_type in ('audio', 'video'));
  end if;

  alter table public.call_sessions
    drop constraint if exists call_sessions_status_check;

  alter table public.call_sessions
    add constraint call_sessions_status_check
    check (status in ('ringing', 'accepted', 'declined', 'missed', 'ended'));

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
        'private_media_opened',
        'private_media_expired',
        'call_event'
      )
    );
end;
$$;

create index if not exists call_sessions_receiver_type_status_idx
  on public.call_sessions (receiver_id, call_type, status, created_at desc);

alter table public.call_sessions enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on public.call_sessions to authenticated;

drop policy if exists "Users can read related calls" on public.call_sessions;
drop policy if exists "Matched users can start calls" on public.call_sessions;
drop policy if exists "Call participants can update calls" on public.call_sessions;

create policy "Users can read related calls"
  on public.call_sessions
  for select
  to authenticated
  using (caller_id = auth.uid() or receiver_id = auth.uid());

create policy "Matched users can start calls"
  on public.call_sessions
  for insert
  to authenticated
  with check (
    caller_id = auth.uid()
    and caller_id <> receiver_id
    and call_type in ('audio', 'video')
    and not public.users_are_blocked(caller_id, receiver_id)
    and exists (
      select 1
      from public.matches
      where matches.id = call_sessions.match_id
        and (
          (
            matches.user_one_id = call_sessions.caller_id
            and matches.user_two_id = call_sessions.receiver_id
          )
          or
          (
            matches.user_two_id = call_sessions.caller_id
            and matches.user_one_id = call_sessions.receiver_id
          )
        )
    )
  );

create policy "Call participants can update calls"
  on public.call_sessions
  for update
  to authenticated
  using (caller_id = auth.uid() or receiver_id = auth.uid())
  with check (
    caller_id = auth.uid()
    or receiver_id = auth.uid()
  );

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
        'low_gold',
        'mutual_attraction',
        'profile_trending',
        'streak_milestone',
        'profile_completion_reminder',
        'follow_request',
        'follow_request_accepted',
        'moderation_update',
        'premium_teaser',
        'incoming_call',
        'missed_call'
      )
    );

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'call_sessions'
  ) then
    alter publication supabase_realtime add table public.call_sessions;
  end if;

  notify pgrst, 'reload schema';
end;
$$;
