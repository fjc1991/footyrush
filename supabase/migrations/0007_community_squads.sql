-- Cross-user "community" squads: a completed squad saved by a registered user so
-- other players can face it in the end-of-season one-off exhibition. The full
-- ManagerSquad (picks + formation + ratings) is stored as jsonb so the opponent
-- can be simulated directly. (drafted_squads/drafted_players in 0001 are bound to
-- minileague_members, so a dedicated jsonb table is simpler here.)

create table public.community_squads (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  display_name text not null,
  manager_rating integer not null default 0,
  squad jsonb not null,
  created_at timestamptz not null default now()
);

create index community_squads_created_idx on public.community_squads (created_at desc);
create index community_squads_profile_idx on public.community_squads (profile_id);

alter table public.community_squads enable row level security;

-- Opponents are public so any player can be matched against them.
create policy "community squads are public" on public.community_squads
  for select using (true);

-- Inserts are performed by trusted server code with the service role only
-- (no client insert/update policy is exposed).
