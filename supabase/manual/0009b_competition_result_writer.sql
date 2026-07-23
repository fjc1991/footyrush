-- FOOTYRUSH 0009B V2 - COMPLETE RESULT WRITER - NO INLINE CASE CONDITIONS
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
  v_expected_games integer := 5;
  v_expected_titles integer := 0;
begin
  if p_competition_mode not in ('minileague', 'invincible') then
    raise exception 'Unsupported competition mode' using errcode = '22023';
  end if;

  if p_competition_mode = 'invincible' then
    v_expected_games := 38;
  end if;

  if p_final_position = 1 then
    v_expected_titles := 1;
  end if;

  if (p_final_position is null and p_competition_mode <> 'minileague')
    or p_final_position < 1
    or (p_competition_mode = 'minileague' and p_final_position > 6)
    or (p_competition_mode = 'invincible' and p_final_position > 20) then
    raise exception 'Invalid final position' using errcode = '22023';
  end if;

  if p_games_played <> v_expected_games then
    raise exception 'Invalid games played' using errcode = '22023';
  end if;

  if p_league_titles <> v_expected_titles then
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
