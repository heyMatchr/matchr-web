create extension if not exists pgcrypto;

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  message_text text not null,
  tone text not null default 'custom',
  visibility text not null default 'private',
  price_gold integer,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint message_templates_title_length check (
    char_length(trim(title)) between 1 and 80
  ),
  constraint message_templates_text_length check (
    char_length(trim(message_text)) between 1 and 500
  ),
  constraint message_templates_tone_check check (
    tone in ('playful', 'bold', 'sweet', 'funny', 'intimate', 'custom')
  ),
  constraint message_templates_visibility_check check (
    visibility in ('private', 'public', 'creator_pack')
  ),
  constraint message_templates_price_check check (
    price_gold is null or price_gold >= 0
  )
);

create index if not exists message_templates_user_active_idx
  on public.message_templates (user_id, active, created_at desc);

create index if not exists message_templates_visibility_active_idx
  on public.message_templates (visibility, active, created_at desc);

alter table public.message_templates enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.message_templates to authenticated;

drop policy if exists "Users can read accessible message templates" on public.message_templates;
drop policy if exists "Users can create their message templates" on public.message_templates;
drop policy if exists "Users can update their message templates" on public.message_templates;
drop policy if exists "Users can delete their message templates" on public.message_templates;

create policy "Users can read accessible message templates"
  on public.message_templates
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or (
      active = true
      and visibility in ('public', 'creator_pack')
    )
  );

create policy "Users can create their message templates"
  on public.message_templates
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update their message templates"
  on public.message_templates
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete their message templates"
  on public.message_templates
  for delete
  to authenticated
  using (user_id = auth.uid());
