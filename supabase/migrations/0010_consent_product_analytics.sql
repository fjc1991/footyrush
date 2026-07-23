-- Privacy-conscious, consent-gated first-party product analytics.
--
-- Events are written by the service-role API only. The application deliberately
-- stores no raw IP address, user agent, email address, X profile data, player
-- names, or free-form text in this table.

create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references auth.users(id) on delete set null,
  anonymous_id uuid not null,
  event_name text not null,
  locale text not null default 'en',
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint product_events_event_name_check check (
    event_name in (
      'app_open',
      'analytics_consent_granted',
      'mode_selected',
      'manager_shuffled',
      'draft_started',
      'draft_completed',
      'match_completed',
      'competition_completed',
      'milestone_prompted',
      'milestone_shared'
    )
  ),
  constraint product_events_locale_check check (locale in ('en', 'es', 'fr', 'pt')),
  constraint product_events_properties_object_check check (jsonb_typeof(properties) = 'object'),
  constraint product_events_properties_size_check check (octet_length(properties::text) <= 2048)
);

create index if not exists product_events_created_at_idx
  on public.product_events (created_at desc);

create index if not exists product_events_event_created_idx
  on public.product_events (event_name, created_at desc);

create index if not exists product_events_profile_created_idx
  on public.product_events (profile_id, created_at desc)
  where profile_id is not null;

alter table public.product_events enable row level security;

-- No client RLS policies are created. Reads and writes are restricted to the
-- server's service role so analytics cannot be browsed or forged through the
-- public Supabase client.
