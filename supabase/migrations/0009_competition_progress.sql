-- Make completed competitions durable, idempotent, and comparable without
-- mixing five-match Mini Leagues with 38-match Invincible seasons.

alter table public.leaderboard_entries
  add column if not exists competition_mode text not null default 'minileague',
  add column if not exists run_id text,
  add column if not exists source_record_id text,
  add column if not exists games_played integer not null default 5,
  add column if not exists final_position integer;

-- New completions persist the validated, attempt-bound reported season data so
-- progress can be populated in the same transaction as completion verification.
-- Historical completed attempts retain NULL here because their final tables
-- cannot be reconstructed safely from the older schema.
alter table public.invincible_attempts
  add column if not exists goals_for integer,
  add column if not exists final_position integer;

-- Existing rows predate client run IDs. Their database UUID is stable and makes
-- each historical row its own immutable run without collapsing old results.
update public.leaderboard_entries
set run_id = id::text
where run_id is null or btrim(run_id) = '';

update public.leaderboard_entries
set source_record_id = id::text
where source_record_id is null or btrim(source_record_id) = '';

-- Keep old application instances writable during a rolling deploy. New clients
-- always provide their stable run id; old clients receive a unique immutable id.
alter table public.leaderboard_entries
  alter column run_id set default gen_random_uuid()::text;

-- Every legacy leaderboard row is a completed five-match Mini League. A title
-- safely proves first place; non-title finishing positions were not retained.
update public.leaderboard_entries
set games_played = 5
where competition_mode = 'minileague' and games_played = 0;

update public.leaderboard_entries
set league_titles = case when league_titles > 0 then 1 else 0 end;

update public.leaderboard_entries
set final_position = 1
where competition_mode = 'minileague' and league_titles > 0 and final_position is null;

alter table public.leaderboard_entries
  alter column run_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'leaderboard_entries_competition_mode_check'
      and conrelid = 'public.leaderboard_entries'::regclass
  ) then
    alter table public.leaderboard_entries
      add constraint leaderboard_entries_competition_mode_check
      check (competition_mode in ('minileague', 'invincible'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'leaderboard_entries_games_played_check'
      and conrelid = 'public.leaderboard_entries'::regclass
  ) then
    alter table public.leaderboard_entries
      add constraint leaderboard_entries_games_played_check
      check (
        (competition_mode = 'minileague' and games_played = 5)
        or (competition_mode = 'invincible' and games_played = 38)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'leaderboard_entries_final_position_check'
      and conrelid = 'public.leaderboard_entries'::regclass
  ) then
    alter table public.leaderboard_entries
      add constraint leaderboard_entries_final_position_check
      check (
        final_position is null
        or (competition_mode = 'minileague' and final_position between 1 and 6)
        or (competition_mode = 'invincible' and final_position between 1 and 20)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'leaderboard_entries_single_title_check'
      and conrelid = 'public.leaderboard_entries'::regclass
  ) then
    alter table public.leaderboard_entries
      add constraint leaderboard_entries_single_title_check
      check (league_titles in (0, 1));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'leaderboard_entries_title_position_check'
      and conrelid = 'public.leaderboard_entries'::regclass
  ) then
    alter table public.leaderboard_entries
      add constraint leaderboard_entries_title_position_check
      check (league_titles = case when final_position = 1 then 1 else 0 end);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'invincible_attempts_final_position_check'
      and conrelid = 'public.invincible_attempts'::regclass
  ) then
    alter table public.invincible_attempts
      add constraint invincible_attempts_final_position_check
      check (final_position is null or final_position between 1 and 20);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'invincible_attempts_goals_for_check'
      and conrelid = 'public.invincible_attempts'::regclass
  ) then
    alter table public.invincible_attempts
      add constraint invincible_attempts_goals_for_check
      check (goals_for is null or goals_for between 0 and 300);
  end if;
end $$;

-- Compatibility for the short rolling-deploy window: the previous result
-- writer omits the new Mini League fields. Normalize those inserts before the
-- stricter format constraints are evaluated.
create or replace function public.normalize_legacy_leaderboard_entry()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.competition_mode = 'minileague' then
    new.games_played := 5;
    if new.league_titles = 1 and new.final_position is null then
      new.final_position := 1;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_legacy_leaderboard_entry on public.leaderboard_entries;
create trigger normalize_legacy_leaderboard_entry
before insert on public.leaderboard_entries
for each row execute function public.normalize_legacy_leaderboard_entry();

-- PostgreSQL unique indexes still permit multiple NULL profile IDs for deleted
-- users, while PostgREST can use these columns as an upsert conflict target.
create unique index if not exists leaderboard_entries_profile_run_unique
  on public.leaderboard_entries (profile_id, run_id);

create index if not exists leaderboard_entries_mode_completed_idx
  on public.leaderboard_entries (competition_mode, completed_at desc);

create index if not exists leaderboard_entries_titles_completed_idx
  on public.leaderboard_entries (league_titles desc, completed_at desc);

-- Recover account history for completed Invincible attempts created before the
-- result writer existed. Attempt rows contain the season points and record but
-- not the full table or goals scored, so these entries intentionally leave the
-- finishing position unknown and do not guess a historical league title.
insert into public.leaderboard_entries (
  profile_id,
  display_name,
  kind,
  period,
  period_start,
  match_points,
  goal_difference,
  goals_for,
  league_titles,
  opponent_strength,
  completed_at,
  competition_mode,
  run_id,
  source_record_id,
  games_played,
  final_position
)
select
  attempts.profile_id,
  profiles.display_name,
  'human',
  'daily',
  attempts.completed_at::date,
  coalesce(attempts.points, 0),
  coalesce(attempts.goal_difference, 0),
  coalesce(attempts.goals_for, 0),
  case when attempts.final_position = 1 then 1 else 0 end,
  1000,
  attempts.completed_at,
  'invincible',
  attempts.id::text,
  'invincible_attempt:' || attempts.id::text,
  38,
  attempts.final_position
from public.invincible_attempts as attempts
join public.profiles as profiles on profiles.id = attempts.profile_id
where attempts.completed_at is not null
on conflict (profile_id, run_id) do nothing;

-- Keep the recovery path active during a rolling deployment. New completion
-- clients supply the verified finish and create a complete row immediately;
-- older clients still leave a safe partial record rather than losing the run.
create or replace function public.capture_invincible_attempt_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.completed_at is null or new.profile_id is null then
    return new;
  end if;

  insert into public.leaderboard_entries (
    profile_id,
    display_name,
    kind,
    period,
    period_start,
    match_points,
    goal_difference,
    goals_for,
    league_titles,
    opponent_strength,
    completed_at,
    competition_mode,
    run_id,
    source_record_id,
    games_played,
    final_position
  )
  select
    new.profile_id,
    profiles.display_name,
    'human',
    'daily',
    new.completed_at::date,
    coalesce(new.points, 0),
    coalesce(new.goal_difference, 0),
    coalesce(new.goals_for, 0),
    case when new.final_position = 1 then 1 else 0 end,
    1000,
    new.completed_at,
    'invincible',
    new.id::text,
    'invincible_attempt:' || new.id::text,
    38,
    new.final_position
  from public.profiles as profiles
  where profiles.id = new.profile_id
  on conflict (profile_id, run_id) do nothing;

  return new;
end;
$$;

revoke all on function public.capture_invincible_attempt_progress() from public;

drop trigger if exists capture_invincible_attempt_progress on public.invincible_attempts;
create trigger capture_invincible_attempt_progress
after insert or update of completed_at on public.invincible_attempts
for each row
when (new.completed_at is not null)
execute function public.capture_invincible_attempt_progress();

-- Atomic immutable result writer used by the service-role API. A finalized run
-- is replay-safe and cannot be rewritten. The only permitted conflict update is
-- enrichment of the deliberately partial row created by the attempt trigger.
create or replace function public.record_competition_result(
  p_profile_id uuid,
  p_display_name text,
  p_competition_mode text,
  p_run_id text,
  p_source_record_id text,
  p_games_played integer,
  p_final_position integer,
  p_match_points integer,
  p_goal_difference integer,
  p_goals_for integer,
  p_league_titles integer,
  p_opponent_strength integer,
  p_completed_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completed_at timestamptz := p_completed_at;
  v_match_points integer := p_match_points;
  v_goal_difference integer := p_goal_difference;
  v_goals_for integer := p_goals_for;
  v_final_position integer := p_final_position;
  v_league_titles integer := p_league_titles;
begin
  if p_competition_mode not in ('minileague', 'invincible') then
    raise exception 'Unsupported competition mode' using errcode = '22023';
  end if;

  if (p_final_position is null and p_competition_mode <> 'minileague')
    or p_final_position < 1
    or (p_competition_mode = 'minileague' and p_final_position > 6)
    or (p_competition_mode = 'invincible' and p_final_position > 20) then
    raise exception 'Invalid final position' using errcode = '22023';
  end if;

  if p_games_played <> case when p_competition_mode = 'invincible' then 38 else 5 end then
    raise exception 'Invalid games played' using errcode = '22023';
  end if;

  if p_league_titles <> case when p_final_position = 1 then 1 else 0 end then
    raise exception 'Title does not match final position' using errcode = '22023';
  end if;

  -- An Invincible result must enrich a real, completed attempt owned by this
  -- account. Its stored completion data, rather than the second POST, wins.
  if p_competition_mode = 'invincible' then
    select
      attempts.completed_at,
      coalesce(attempts.points, p_match_points),
      coalesce(attempts.goal_difference, p_goal_difference),
      attempts.goals_for,
      attempts.final_position,
      case when attempts.final_position = 1 then 1 else 0 end
    into v_completed_at, v_match_points, v_goal_difference, v_goals_for, v_final_position, v_league_titles
    from public.invincible_attempts as attempts
    where attempts.id = p_run_id::uuid
      and attempts.profile_id = p_profile_id
      and attempts.completed_at is not null
      and attempts.wins + attempts.draws + attempts.losses = 38
      and attempts.points = attempts.wins * 3 + attempts.draws
      and attempts.goals_for is not null
      and attempts.final_position is not null;

    if not found then
      raise exception 'Completed Invincible attempt not found' using errcode = '22023';
    end if;
  end if;

  insert into public.leaderboard_entries as existing (
    profile_id,
    display_name,
    kind,
    period,
    period_start,
    match_points,
    goal_difference,
    goals_for,
    league_titles,
    opponent_strength,
    completed_at,
    competition_mode,
    run_id,
    source_record_id,
    games_played,
    final_position
  )
  values (
    p_profile_id,
    p_display_name,
    'human',
    'daily',
    v_completed_at::date,
    v_match_points,
    v_goal_difference,
    v_goals_for,
    v_league_titles,
    p_opponent_strength,
    v_completed_at,
    p_competition_mode,
    p_run_id,
    p_source_record_id,
    p_games_played,
    v_final_position
  )
  on conflict (profile_id, run_id) do update
  set
    display_name = excluded.display_name,
    period_start = excluded.period_start,
    match_points = excluded.match_points,
    goal_difference = excluded.goal_difference,
    goals_for = excluded.goals_for,
    league_titles = excluded.league_titles,
    opponent_strength = excluded.opponent_strength,
    completed_at = excluded.completed_at,
    source_record_id = excluded.source_record_id,
    games_played = excluded.games_played,
    final_position = excluded.final_position
  where existing.competition_mode = 'invincible'
    and excluded.competition_mode = 'invincible'
    and excluded.competition_mode = existing.competition_mode
    and existing.source_record_id like 'invincible_attempt:%'
    and excluded.source_record_id like 'result:%';
end;
$$;

revoke all on function public.record_competition_result(
  uuid, text, text, text, text, integer, integer, integer, integer, integer, integer, integer, timestamptz
) from public;
grant execute on function public.record_competition_result(
  uuid, text, text, text, text, integer, integer, integer, integer, integer, integer, integer, timestamptz
) to service_role;

comment on column public.leaderboard_entries.run_id is
  'Stable client competition identifier used with profile_id for idempotent result writes.';
comment on column public.leaderboard_entries.source_record_id is
  'Original record identifier supplied by the game, retained for diagnostics.';
