create extension if not exists pgcrypto;

alter table public.call_sessions
  add column if not exists offer jsonb,
  add column if not exists answer jsonb,
  add column if not exists ice_candidates jsonb not null default '[]'::jsonb,
  add column if not exists connection_state text default 'ringing',
  add column if not exists ended_reason text;

update public.call_sessions
set ice_candidates = '[]'::jsonb
where ice_candidates is null;

alter table public.call_sessions
  alter column ice_candidates set default '[]'::jsonb,
  alter column ice_candidates set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'call_sessions_connection_state_check'
      and conrelid = 'public.call_sessions'::regclass
  ) then
    alter table public.call_sessions
      add constraint call_sessions_connection_state_check
      check (
        connection_state is null
        or connection_state in (
          'ringing',
          'connecting',
          'connected',
          'reconnecting',
          'ended'
        )
      );
  end if;

  notify pgrst, 'reload schema';
end;
$$;

create index if not exists call_sessions_connection_state_idx
  on public.call_sessions (connection_state, created_at desc);

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
  using (
    caller_id = auth.uid()
    or receiver_id = auth.uid()
  )
  with check (
    caller_id = auth.uid()
    or receiver_id = auth.uid()
  );
