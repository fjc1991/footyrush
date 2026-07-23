import { NextRequest, NextResponse } from "next/server";
import { aggregateLeaderboard, periodStart } from "@/lib/game/leaderboard";
import type {
  CompetitionMode,
  LeaderboardMetric,
  LeaderboardRecord,
  Period
} from "@/lib/game/types";
import { isCompetitionSchemaMissing } from "@/lib/server/database-errors";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const periods = new Set<Period>(["daily", "weekly", "monthly", "all_time"]);
const metrics = new Set<LeaderboardMetric>(["points", "titles"]);

interface EntryRow {
  id: string;
  profile_id: string | null;
  display_name: string;
  kind: "human" | "reserve";
  competition_mode: CompetitionMode | null;
  run_id: string | null;
  games_played: number | null;
  final_position: number | null;
  match_points: number;
  goal_difference: number;
  goals_for: number;
  league_titles: number;
  opponent_strength: number;
  completed_at: string;
}

interface LegacyEntryRow {
  id: string;
  profile_id: string | null;
  display_name: string;
  kind: "human" | "reserve";
  match_points: number;
  goal_difference: number;
  goals_for: number;
  league_titles: number;
  opponent_strength: number;
  completed_at: string;
}

function toRecord(row: EntryRow): LeaderboardRecord {
  return {
    id: row.id,
    // Deleted profiles must not collapse onto one display-name bucket.
    userId: row.profile_id ?? `deleted:${row.id}`,
    displayName: row.display_name,
    kind: row.kind,
    competitionMode: row.competition_mode === "invincible" ? "invincible" : "minileague",
    runId: row.run_id || row.id,
    gamesPlayed: row.games_played ?? 0,
    finalPosition: row.final_position,
    periodAt: row.completed_at,
    matchPoints: row.match_points,
    goalDifference: row.goal_difference,
    goalsFor: row.goals_for,
    leagueTitles: row.league_titles,
    opponentStrength: row.opponent_strength,
    completedAt: row.completed_at
  };
}

function legacyToRecord(row: LegacyEntryRow): LeaderboardRecord {
  return {
    id: row.id,
    userId: row.profile_id ?? `deleted:${row.id}`,
    displayName: row.display_name,
    kind: row.kind,
    competitionMode: "minileague",
    runId: row.id,
    legacy: true,
    gamesPlayed: 5,
    finalPosition: row.league_titles === 1 ? 1 : null,
    periodAt: row.completed_at,
    matchPoints: row.match_points,
    goalDifference: row.goal_difference,
    goalsFor: row.goals_for,
    leagueTitles: row.league_titles,
    opponentStrength: row.opponent_strength,
    completedAt: row.completed_at
  };
}

export async function GET(request: NextRequest) {
  const periodParam = request.nextUrl.searchParams.get("period") ?? "daily";
  const period = periods.has(periodParam as Period) ? (periodParam as Period) : "daily";
  const metricParam = request.nextUrl.searchParams.get("metric") ?? "points";
  const metric = metrics.has(metricParam as LeaderboardMetric)
    ? (metricParam as LeaderboardMetric)
    : "points";
  const modeParam = request.nextUrl.searchParams.get("competitionMode") ?? request.nextUrl.searchParams.get("mode");
  const competitionMode: CompetitionMode = modeParam === "invincible" ? "invincible" : "minileague";

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json({ entries: [], production: false, period, metric });
  }

  // Page the complete period. Points are format-specific by default so a
  // 38-match Invincible total never overwhelms a five-match Mini League board.
  // Title boards intentionally combine both formats and expose the split totals.
  const windowStart = periodStart(new Date(), period).toISOString();
  const snapshotAt = new Date().toISOString();
  const PAGE = 1000;
  const MAX_ROWS = 50_000;
  const rows: EntryRow[] = [];
  let truncated = false;

  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    let query = supabase
      .from("leaderboard_entries")
      .select(
        "id, profile_id, display_name, kind, competition_mode, run_id, games_played, final_position, match_points, goal_difference, goals_for, league_titles, opponent_strength, completed_at"
      )
      .lte("completed_at", snapshotAt);
    if (period !== "all_time") {
      query = query.gte("completed_at", windowStart);
    }
    if (metric === "points") {
      query = query.eq("competition_mode", competitionMode);
    } else {
      query = query.eq("league_titles", 1);
    }

    const { data, error } = await query
      .order("completed_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) {
      if (isCompetitionSchemaMissing(error)) {
        // Migration 0009 has not reached this project yet. Preserve Mini League
        // rankings through the original table shape instead of returning an
        // empty board or losing newly completed runs.
        if (metric === "points" && competitionMode === "invincible") {
          return NextResponse.json({
            entries: [],
            production: true,
            degraded: true,
            period,
            metric,
            competitionMode
          });
        }
        let legacyQuery = supabase
          .from("leaderboard_entries")
          .select(
            "id, profile_id, display_name, kind, match_points, goal_difference, goals_for, league_titles, opponent_strength, completed_at"
          )
          .lte("completed_at", snapshotAt);
        if (period !== "all_time") {
          legacyQuery = legacyQuery.gte("completed_at", windowStart);
        }
        if (metric === "titles") {
          legacyQuery = legacyQuery.eq("league_titles", 1);
        }
        const { data: legacyData, error: legacyError } = await legacyQuery
          .order("completed_at", { ascending: false })
          .order("id", { ascending: false })
          .range(0, MAX_ROWS - 1);
        if (!legacyError) {
          return NextResponse.json({
            entries: aggregateLeaderboard(
              ((legacyData as LegacyEntryRow[] | null) ?? []).map(legacyToRecord),
              period,
              new Date(),
              metric
            ),
            production: true,
            degraded: true,
            truncated: (legacyData?.length ?? 0) >= MAX_ROWS,
            period,
            metric,
            ...(metric === "points" ? { competitionMode: "minileague" } : {})
          });
        }
      }
      return NextResponse.json({ entries: [], production: true, degraded: true, period, metric });
    }
    const page = (data as EntryRow[] | null) ?? [];
    rows.push(...page);
    if (page.length < PAGE) {
      break;
    }
    if (from + PAGE >= MAX_ROWS) {
      truncated = true;
    }
  }

  const entries = aggregateLeaderboard(rows.map(toRecord), period, new Date(), metric);
  return NextResponse.json({
    entries,
    production: true,
    truncated,
    period,
    metric,
    ...(metric === "points" ? { competitionMode } : {})
  });
}
