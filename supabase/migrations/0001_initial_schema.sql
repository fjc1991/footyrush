create extension if not exists pgcrypto;

create type manager_kind as enum ('human', 'reserve');
create type draft_mode as enum ('classic', 'expert');
create type leaderboard_period as enum ('daily', 'weekly', 'monthly');

create table public.teams (
  code text primary key,
  name text not null,
  badge text not null default ''
);

create table public.seasons (
  year integer primary key
);

create table public.team_seasons (
  id uuid primary key default gen_random_uuid(),
  team_code text not null references public.teams(code) on delete cascade,
  year integer not null references public.seasons(year) on delete cascade,
  unique(team_code, year)
);

create table public.players (
  id integer primary key,
  name text not null
);

create table public.squad_players (
  team_season_id uuid not null references public.team_seasons(id) on delete cascade,
  player_id integer not null references public.players(id) on delete cascade,
  positions text[] not null,
  overall integer not null,
  age integer not null,
  shirt_number integer not null,
  pac integer not null,
  sho integer not null,
  pas integer not null,
  dri integer not null,
  def integer not null,
  phy integer not null,
  primary key (team_season_id, player_id)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email text,
  theme text not null default 'dark',
  locale text not null default 'en',
  mmr integer not null default 1000,
  completed_leagues integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.guest_play_allowances (
  ip_hash text primary key,
  play_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.minileagues (
  id uuid primary key default gen_random_uuid(),
  skill_band text not null,
  status text not null default 'drafting',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.minileague_members (
  id uuid primary key default gen_random_uuid(),
  minileague_id uuid not null references public.minileagues(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  display_name text not null,
  kind manager_kind not null,
  formation_id text not null,
  mode draft_mode not null,
  mmr integer not null default 1000,
  completed_leagues integer not null default 0,
  injured_player_ids integer[] not null default '{}',
  unique(minileague_id, display_name)
);

create table public.drafted_squads (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.minileague_members(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.drafted_players (
  drafted_squad_id uuid not null references public.drafted_squads(id) on delete cascade,
  slot_id text not null,
  slot_label text not null,
  target text not null,
  team_code text not null references public.teams(code),
  year integer not null references public.seasons(year),
  player_id integer not null references public.players(id),
  fit numeric not null,
  effective_rating numeric not null,
  primary key (drafted_squad_id, slot_id),
  unique(drafted_squad_id, player_id)
);

create table public.fixtures (
  id uuid primary key default gen_random_uuid(),
  minileague_id uuid not null references public.minileagues(id) on delete cascade,
  round integer not null,
  home_member_id uuid not null references public.minileague_members(id),
  away_member_id uuid not null references public.minileague_members(id),
  home_goals integer,
  away_goals integer,
  played_at timestamptz,
  unique(minileague_id, round, home_member_id, away_member_id)
);

create table public.match_events (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  second integer not null,
  code text not null,
  team_member_id uuid references public.minileague_members(id),
  player_id integer references public.players(id),
  params jsonb not null default '{}'
);

create table public.leaderboard_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  display_name text not null,
  kind manager_kind not null,
  period leaderboard_period not null,
  period_start date not null,
  match_points integer not null,
  goal_difference integer not null,
  goals_for integer not null,
  league_titles integer not null default 0,
  opponent_strength integer not null default 1000,
  completed_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.teams enable row level security;
alter table public.seasons enable row level security;
alter table public.team_seasons enable row level security;
alter table public.players enable row level security;
alter table public.squad_players enable row level security;
alter table public.profiles enable row level security;
alter table public.guest_play_allowances enable row level security;
alter table public.minileagues enable row level security;
alter table public.minileague_members enable row level security;
alter table public.drafted_squads enable row level security;
alter table public.drafted_players enable row level security;
alter table public.fixtures enable row level security;
alter table public.match_events enable row level security;
alter table public.leaderboard_entries enable row level security;

create policy "football data is public" on public.teams for select using (true);
create policy "seasons are public" on public.seasons for select using (true);
create policy "team seasons are public" on public.team_seasons for select using (true);
create policy "players are public" on public.players for select using (true);
create policy "squads are public" on public.squad_players for select using (true);

create policy "profiles are readable by owner" on public.profiles for select using (auth.uid() = id);
create policy "profiles are insertable by owner" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles are updatable by owner" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "leaderboards are public" on public.leaderboard_entries for select using (true);

create policy "members can read their leagues" on public.minileagues
  for select using (
    exists (
      select 1 from public.minileague_members m
      where m.minileague_id = public.minileagues.id and m.profile_id = auth.uid()
    )
  );

create policy "members can read league members" on public.minileague_members
  for select using (
    profile_id = auth.uid()
    or minileague_id in (
      select mine.minileague_id from public.minileague_members mine
      where mine.profile_id = auth.uid()
    )
  );

create policy "members can read drafted squads" on public.drafted_squads
  for select using (
    exists (
      select 1
      from public.minileague_members m
      where m.id = member_id and (
        m.profile_id = auth.uid()
        or exists (
          select 1 from public.minileague_members mine
          where mine.minileague_id = m.minileague_id and mine.profile_id = auth.uid()
        )
      )
    )
  );

create policy "members can read drafted players" on public.drafted_players
  for select using (
    exists (
      select 1
      from public.drafted_squads s
      join public.minileague_members m on m.id = s.member_id
      where s.id = drafted_squad_id and (
        m.profile_id = auth.uid()
        or exists (
          select 1 from public.minileague_members mine
          where mine.minileague_id = m.minileague_id and mine.profile_id = auth.uid()
        )
      )
    )
  );

create policy "members can read fixtures" on public.fixtures
  for select using (
    exists (
      select 1 from public.minileague_members mine
      where mine.minileague_id = public.fixtures.minileague_id and mine.profile_id = auth.uid()
    )
  );

create policy "members can read match events" on public.match_events
  for select using (
    exists (
      select 1
      from public.fixtures f
      join public.minileague_members mine on mine.minileague_id = f.minileague_id
      where f.id = public.match_events.fixture_id and mine.profile_id = auth.uid()
    )
  );

-- Competitive writes are performed by trusted server code with the service role.
-- No client-side insert/update policies are intentionally exposed for leagues,
-- fixtures, events, guest IP hashes, or leaderboard writes.
