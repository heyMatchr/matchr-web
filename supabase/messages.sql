create extension if not exists pgcrypto;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (
    char_length(trim(content)) > 0
    and char_length(content) <= 1000
  ),
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.messages
  add column if not exists read_at timestamptz;

alter table public.messages enable row level security;

grant usage on schema public to authenticated;
grant select, insert on public.messages to authenticated;
revoke update on public.messages from authenticated;
grant update (read_at) on public.messages to authenticated;

drop policy if exists "Users can read match messages" on public.messages;
drop policy if exists "Users can send match messages" on public.messages;
drop policy if exists "Users can mark received messages read" on public.messages;

create policy "Users can read match messages"
  on public.messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.matches
      where matches.id = messages.match_id
        and (
          matches.user_one_id = auth.uid()
          or matches.user_two_id = auth.uid()
        )
    )
  );

create policy "Users can send match messages"
  on public.messages
  for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and sender_id <> receiver_id
    and exists (
      select 1
      from public.matches
      where matches.id = messages.match_id
        and (
          matches.user_one_id = auth.uid()
          or matches.user_two_id = auth.uid()
        )
        and (
          messages.receiver_id = matches.user_one_id
          or messages.receiver_id = matches.user_two_id
        )
        and messages.receiver_id <> auth.uid()
    )
  );

create policy "Users can mark received messages read"
  on public.messages
  for update
  to authenticated
  using (
    auth.uid() = receiver_id
    and exists (
      select 1
      from public.matches
      where matches.id = messages.match_id
        and (
          matches.user_one_id = auth.uid()
          or matches.user_two_id = auth.uid()
        )
    )
  )
  with check (
    auth.uid() = receiver_id
    and exists (
      select 1
      from public.matches
      where matches.id = messages.match_id
        and (
          matches.user_one_id = auth.uid()
          or matches.user_two_id = auth.uid()
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
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;
