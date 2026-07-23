-- FootyRush public identity, account engagement, optional personalization and
-- consented audience data. Apply after 0009 and 0010.

create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists manager_id_confirmed_at timestamptz,
  add column if not exists manager_id_rename_available boolean not null default false,
  add column if not exists last_seen_at timestamptz;

-- Generated administrator fallback IDs from the pre-onboarding release are not
-- public choices. Clear only exact deterministic values derived from this row.
update public.profiles
set manager_id = null,
    display_name = 'Manager'
where manager_id in (
  'mgr_' || substr(encode(digest(id::text, 'sha256'), 'hex'), 1, 14),
  'mgr_' || substr(encode(digest(id::text, 'sha256'), 'hex'), 15, 14),
  'mgr_' || substr(encode(digest(id::text, 'sha256'), 'hex'), 29, 14),
  'mgr_' || substr(encode(digest(id::text, 'sha256'), 'hex'), 43, 14)
);

-- Every account present at rollout receives one confirmation or rename.
update public.profiles
set manager_id_confirmed_at = null,
    manager_id_rename_available = true;

create table if not exists public.profile_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  country_code text,
  age_band text,
  gender text,
  favourite_club_code text,
  favourite_current_player text,
  favourite_legend text,
  followed_leagues text[] not null default '{}',
  preferred_game_mode text,
  discovery_source text,
  preferred_kit_style text,
  audience_insights_opt_in boolean not null default false,
  audience_insights_consented_at timestamptz,
  audience_insights_withdrawn_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint profile_preferences_country_check
    check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  constraint profile_preferences_age_check
    check (age_band is null or age_band in ('under_18','18_24','25_34','35_44','45_54','55_plus','prefer_not')),
  constraint profile_preferences_gender_check
    check (gender is null or gender in ('woman','man','non_binary','self_describe','prefer_not')),
  constraint profile_preferences_mode_check
    check (preferred_game_mode is null or preferred_game_mode in ('minileague','invincible')),
  constraint profile_preferences_kit_check
    check (preferred_kit_style is null or preferred_kit_style in ('classic','retro','modern','bold')),
  constraint profile_preferences_leagues_check
    check (cardinality(followed_leagues) <= 12)
);

create table if not exists public.marketing_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  footyrush_email_opt_in boolean not null default false,
  consented_at timestamptz,
  withdrawn_at timestamptz,
  consent_source text,
  policy_version text not null default '2026-07',
  updated_at timestamptz not null default now()
);

create table if not exists public.user_visits (
  id uuid primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  active_seconds integer not null default 0,
  locale text not null default 'en',
  device_class text not null default 'desktop',
  constraint user_visits_active_seconds_check check (active_seconds between 0 and 86400),
  constraint user_visits_locale_check check (locale in ('en','es','fr','pt')),
  constraint user_visits_device_check check (device_class in ('mobile','tablet','desktop'))
);

create table if not exists public.user_mode_runs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  run_id text not null,
  mode text not null,
  started_at timestamptz not null default now(),
  draft_completed_at timestamptz,
  completed_at timestamptz,
  abandoned_at timestamptz,
  matches_played integer not null default 0,
  outcome text,
  title_won boolean not null default false,
  constraint user_mode_runs_mode_check check (mode in ('minileague','invincible','exhibition')),
  constraint user_mode_runs_matches_check check (matches_played between 0 and 38),
  constraint user_mode_runs_outcome_check check (outcome is null or outcome in ('win','draw','loss','completed','unbeaten')),
  unique (profile_id, run_id)
);

create table if not exists public.admin_export_audit (
  id uuid primary key default gen_random_uuid(),
  admin_profile_id uuid not null references public.profiles(id) on delete restrict,
  export_kind text not null,
  row_count integer not null,
  filters jsonb not null default '{}',
  created_at timestamptz not null default now(),
  constraint admin_export_row_count_check check (row_count >= 0)
);

create index if not exists user_visits_profile_started_idx
  on public.user_visits (profile_id, started_at desc);
create index if not exists user_visits_activity_idx
  on public.user_visits (last_activity_at desc);
create index if not exists user_mode_runs_profile_started_idx
  on public.user_mode_runs (profile_id, started_at desc);
create index if not exists user_mode_runs_mode_completed_idx
  on public.user_mode_runs (mode, completed_at desc);
create index if not exists profile_preferences_audience_idx
  on public.profile_preferences (audience_insights_opt_in)
  where audience_insights_opt_in = true;
create index if not exists marketing_preferences_email_idx
  on public.marketing_preferences (footyrush_email_opt_in)
  where footyrush_email_opt_in = true;

alter table public.profile_preferences enable row level security;
alter table public.marketing_preferences enable row level security;
alter table public.user_visits enable row level security;
alter table public.user_mode_runs enable row level security;
alter table public.admin_export_audit enable row level security;

-- These tables are intentionally service-role only. Authenticated application
-- access goes through API routes that derive profile/admin identity from the
-- verified Supabase bearer token.

create or replace function public.claim_manager_id(
  p_profile_id uuid,
  p_manager_id text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_manager_id text := lower(btrim(p_manager_id));
  v_profile public.profiles;
begin
  if v_manager_id !~ '^[a-z0-9_]{3,18}$' then
    raise exception 'Invalid manager ID' using errcode = '22023';
  end if;

  select * into v_profile
  from public.profiles
  where id = p_profile_id
  for update;

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  if v_profile.manager_id_confirmed_at is not null
     and not v_profile.manager_id_rename_available then
    raise exception 'Manager ID confirmation already used' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.profiles
    where lower(manager_id) = v_manager_id and id <> p_profile_id
  ) then
    raise unique_violation using message = 'That manager ID is already taken';
  end if;

  update public.profiles
  set manager_id = v_manager_id,
      display_name = '@' || v_manager_id,
      manager_id_confirmed_at = now(),
      manager_id_rename_available = false,
      updated_at = now(),
      last_seen_at = now()
  where id = p_profile_id
  returning * into v_profile;

  update public.leaderboard_entries
  set display_name = '@' || v_manager_id
  where profile_id = p_profile_id;

  update public.community_squads
  set display_name = '@' || v_manager_id
  where profile_id = p_profile_id;

  update public.minileague_members
  set display_name = '@' || v_manager_id
  where profile_id = p_profile_id;

  return v_profile;
end;
$$;

revoke all on function public.claim_manager_id(uuid, text) from public;
grant execute on function public.claim_manager_id(uuid, text) to service_role;

-- Future accounts always complete FootyRush identity inside the application.
-- Provider metadata is retained by auth.users but is never made public.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  email_name text := nullif(split_part(coalesce(new.email, ''), '@', 1), '');
begin
  insert into public.profiles (
    id, display_name, email, manager_id, manager_id_confirmed_at,
    manager_id_rename_available, locale, last_seen_at
  )
  values (
    new.id, coalesce(email_name, 'Manager'), new.email, null, null,
    false, 'en', now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Seed durable run counts from the competitive history already collected.
insert into public.user_mode_runs (
  profile_id, run_id, mode, started_at, draft_completed_at, completed_at,
  matches_played, outcome, title_won
)
select
  profile_id,
  run_id,
  competition_mode,
  completed_at,
  completed_at,
  completed_at,
  games_played,
  case when competition_mode = 'invincible' and league_titles = 1 then 'unbeaten' else 'completed' end,
  league_titles = 1
from public.leaderboard_entries
where profile_id is not null
on conflict (profile_id, run_id) do nothing;

comment on table public.user_visits is
  'Coarse signed-in visit and active-time data. No raw IP, user agent or fingerprint is stored.';
comment on table public.marketing_preferences is
  'Explicit FootyRush first-party promotional-email consent. Default off.';
comment on column public.profile_preferences.audience_insights_opt_in is
  'Separate default-off consent for optional preferences in anonymized aggregate audience reports.';
