create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  target_user_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.admin_audit_logs enable row level security;

grant select on public.admin_audit_logs to authenticated;

drop policy if exists "Admins can read admin audit logs" on public.admin_audit_logs;

create policy "Admins can read admin audit logs"
  on public.admin_audit_logs
  for select
  to authenticated
  using (public.is_admin(auth.uid()));
