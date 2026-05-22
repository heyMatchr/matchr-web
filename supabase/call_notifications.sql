create extension if not exists pgcrypto;

create table if not exists public.call_signals (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.call_sessions(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('offer', 'answer', 'ice')),
  payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists call_signals_call_created_idx
  on public.call_signals (call_id, created_at);

create index if not exists call_signals_call_type_idx
  on public.call_signals (call_id, type);

alter table public.call_signals enable row level security;

grant usage on schema public to authenticated;
grant select, insert on public.call_signals to authenticated;

drop policy if exists "Call participants can read signals" on public.call_signals;
drop policy if exists "Call participants can create signals" on public.call_signals;

create policy "Call participants can read signals"
  on public.call_signals
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.call_sessions
      where call_sessions.id = call_signals.call_id
        and (
          call_sessions.caller_id = auth.uid()
          or call_sessions.receiver_id = auth.uid()
        )
    )
  );

create policy "Call participants can create signals"
  on public.call_signals
  for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1
      from public.call_sessions
      where call_sessions.id = call_signals.call_id
        and (
          call_sessions.caller_id = auth.uid()
          or call_sessions.receiver_id = auth.uid()
        )
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'call_signals'
  ) then
    alter publication supabase_realtime add table public.call_signals;
  end if;

  notify pgrst, 'reload schema';
end;
$$;
