create extension if not exists pgcrypto;

create table if not exists public.private_media_watermark_views (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null references public.messages(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  public_id text,
  display_name text,
  watermark_text text not null,
  viewed_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists private_media_watermark_views_media_idx
  on public.private_media_watermark_views (media_id, created_at desc);

create index if not exists private_media_watermark_views_recipient_idx
  on public.private_media_watermark_views (recipient_id, created_at desc);

create index if not exists private_media_watermark_views_public_id_idx
  on public.private_media_watermark_views (public_id, created_at desc);

alter table public.private_media_watermark_views enable row level security;

revoke all on public.private_media_watermark_views from anon;
revoke insert, update, delete on public.private_media_watermark_views from authenticated;
grant select on public.private_media_watermark_views to authenticated;

drop policy if exists "Admins can read private media watermark views" on public.private_media_watermark_views;

create policy "Admins can read private media watermark views"
  on public.private_media_watermark_views
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

comment on table public.private_media_watermark_views is
  'Leak attribution ledger for private media watermark views. Apply before broader live-user testing.';

comment on column public.private_media_watermark_views.media_id is
  'Private media message id that was viewed.';
