alter table public.profiles
  add column if not exists gender_identity text,
  add column if not exists pronouns text,
  add column if not exists sexual_orientation text,
  add column if not exists show_gender_on_profile boolean not null default true,
  add column if not exists show_orientation_on_profile boolean not null default false;

alter table if exists public.user_settings
  add column if not exists interested_in_gender_identities text[] not null default '{}'::text[],
  add column if not exists interested_in_orientations text[] not null default '{}'::text[],
  add column if not exists inclusive_discovery boolean not null default true;

alter table if exists public.discover_preferences
  add column if not exists interested_in_gender_identities text[] not null default '{}'::text[],
  add column if not exists interested_in_orientations text[] not null default '{}'::text[],
  add column if not exists inclusive_mode boolean not null default true;

create index if not exists profiles_gender_identity_idx
  on public.profiles (gender_identity);

create index if not exists profiles_sexual_orientation_idx
  on public.profiles (sexual_orientation);

grant select on public.profiles to authenticated;
grant update (
  gender_identity,
  pronouns,
  sexual_orientation,
  show_gender_on_profile,
  show_orientation_on_profile
) on public.profiles to authenticated;

grant select, insert, update on public.user_settings to authenticated;
grant select, insert, update on public.discover_preferences to authenticated;
