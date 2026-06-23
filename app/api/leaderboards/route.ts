import { NextRequest, NextResponse } from "next/server";
import { aggregateLeaderboard, periodStart } from "@/lib/game/leaderboard";
import type { LeaderboardRecord, Period } from "@/lib/game/types";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const periods = new Set<Period>(["daily", "weekly", "monthly"]);

interface EntryRow {
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
    // Orphaned rows (profile deleted -> profile_id NULL) must NOT collapse onto a
    // shared display_name; give them a unique synthetic key so they never merge.
    userId: row.profile_id ?? `deleted:${row.id}`,
    displayName: row.display_name,
    kind: row.kind,
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

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json({ entries: [], production: false });
  }

  // Page through every row inside the requested window so cumulative aggregation
  // is correct (a single bounded fetch would silently drop the oldest entries in
  // busy windows). Capped at MAX_ROWS as a backstop; `truncated` flags the cap.
  const windowStart = periodStart(new Date(), period).toISOString();
  const PAGE = 1000;
  const MAX_ROWS = 50_000;
  const rows: EntryRow[] = [];
  let truncated = false;

  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await supabase
      .from("leaderboard_entries")
      .select("id, profile_id, display_name, kind, match_points, goal_difference, goals_for, league_titles, opponent_strength, completed_at")
      .gte("completed_at", windowStart)
      .order("completed_at", { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) {
      return NextResponse.json({ entries: [], production: true, degraded: true });
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

  const records = rows.map(toRecord);
  return NextResponse.json({ entries: aggregateLeaderboard(records, period), production: true, truncated });
}
