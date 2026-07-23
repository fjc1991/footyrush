import { NextRequest, NextResponse } from "next/server";
import type { CompetitionMode, LeaderboardRecord } from "@/lib/game/types";
import { canonicalAccountRunId, isResultUuid } from "@/lib/game/result-id";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/server/auth";
import { isCompetitionSchemaMissing } from "@/lib/server/database-errors";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ResultsBody {
  /** Records produced client-side by recordsFromLeague(). */
  records?: unknown;
  completedAt?: unknown;
}

interface EntryRow {
  id: string;
  profile_id: string | null;
  display_name: string;
  kind: "human" | "reserve";
  competition_mode: CompetitionMode;
  run_id: string;
  games_played: number;
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampInt(value: unknown, min: number, max: number, fallback = min): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function boundedQueryInt(value: string | null, min: number, max: number, fallback: number): number {
  if (value === null || value.trim() === "") {
    return fallback;
  }
  return clampInt(value, min, max, fallback);
}

function validCompletedAt(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const timestamp = Date.parse(value);
  const earliest = Date.UTC(2020, 0, 1);
  const latest = Date.now() + 5 * 60 * 1000;
  return Number.isFinite(timestamp) && timestamp >= earliest && timestamp <= latest
    ? new Date(timestamp).toISOString()
    : fallback;
}

function normalizeMode(value: unknown): CompetitionMode | null {
  if (value === undefined || value === null || value === "") {
    return "minileague";
  }
  return value === "minileague" || value === "invincible" ? value : null;
}

function normalizeRunId(record: Record<string, unknown>): string | null {
  const value = typeof record.runId === "string" && record.runId.trim()
    ? record.runId.trim()
    : typeof record.id === "string"
      ? record.id.trim()
      : "";
  if (!value || value.length > 160 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) {
    return null;
  }
  return value;
}

function toRecord(row: EntryRow, legacy = false): LeaderboardRecord {
  return {
    id: row.id,
    userId: row.profile_id ?? `deleted:${row.id}`,
    displayName: row.display_name,
    kind: row.kind,
    competitionMode: row.competition_mode === "invincible" ? "invincible" : "minileague",
    runId: row.run_id,
    ...(legacy ? { legacy: true } : {}),
    gamesPlayed: row.games_played,
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
  return toRecord({
    ...row,
    competition_mode: "minileague",
    run_id: row.id,
    games_played: 5,
    final_position: row.league_titles === 1 ? 1 : null
  }, true);
}

async function writeLegacyMiniLeagueResult(
  supabase: NonNullable<ReturnType<typeof getSupabaseServiceClient>>,
  row: Record<string, unknown>
) {
  const completedAt = String(row.p_completed_at);
  return supabase.from("leaderboard_entries").upsert({
    id: row.p_run_id,
    profile_id: row.p_profile_id,
    display_name: row.p_display_name,
    kind: "human",
    period: "daily",
    period_start: completedAt.slice(0, 10),
    match_points: row.p_match_points,
    goal_difference: row.p_goal_difference,
    goals_for: row.p_goals_for,
    league_titles: row.p_league_titles,
    opponent_strength: row.p_opponent_strength,
    completed_at: completedAt
  }, { onConflict: "id" });
}

/**
 * Persist a completed competition. Identity and display name come from the
 * verified canonical profile, never from forgeable client fields. Replaying the
 * same run is safe: profile_id + run_id is an idempotency key in migration 0009.
 */
export async function POST(request: NextRequest) {
  const limit = await rateLimit(request, "results", { limit: 30, window: "1 h" });
  if (!limit.success) {
    return tooManyRequests(limit);
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Results service is unavailable.", production: false }, { status: 503 });
  }

  const profileId = await getAuthenticatedUserId(request);
  if (!profileId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as ResultsBody | null;
  if (!body || !Array.isArray(body.records) || body.records.length === 0 || body.records.length > 10) {
    return NextResponse.json({ error: "Provide between one and ten completed result records." }, { status: 400 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("id", profileId)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: "Could not verify profile." }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }

  const requestCompletedAt = validCompletedAt(body.completedAt, new Date().toISOString());
  const normalizedRows: Record<string, unknown>[] = [];
  const submittedRunIds = new Set<string>();

  for (const value of body.records) {
    if (!isObject(value) || (value.kind !== undefined && value.kind !== "human")) {
      return NextResponse.json({ error: "Every result must be a human competition record." }, { status: 400 });
    }
    const competitionMode = normalizeMode(value.competitionMode);
    const submittedRunId = normalizeRunId(value);
    if (!competitionMode || !submittedRunId) {
      return NextResponse.json({ error: "Each result needs a valid competition mode and run ID." }, { status: 400 });
    }
    if (competitionMode === "invincible" && !isResultUuid(submittedRunId)) {
      return NextResponse.json({ error: "Invincible results need a verified attempt ID." }, { status: 400 });
    }
    const runId = await canonicalAccountRunId(profile.id, competitionMode, submittedRunId);
    if (submittedRunIds.has(runId)) {
      return NextResponse.json({ error: "Each run ID may only appear once per request." }, { status: 400 });
    }
    submittedRunIds.add(runId);

    const completedAt = validCompletedAt(value.completedAt, requestCompletedAt);
    const maximumPosition = competitionMode === "invincible" ? 20 : 6;
    const legacyPayload = value.legacy === true || (
      value.competitionMode === undefined &&
      value.runId === undefined &&
      value.gamesPlayed === undefined &&
      value.finalPosition === undefined
    );
    let finalPosition: number | null;
    if (legacyPayload) {
      finalPosition = clampInt(value.leagueTitles, 0, 1) === 1 ? 1 : null;
    } else if (
      typeof value.finalPosition !== "number" ||
      !Number.isInteger(value.finalPosition) ||
      value.finalPosition < 1 ||
      value.finalPosition > maximumPosition
    ) {
      return NextResponse.json(
        { error: `Final position must be a whole number from 1 to ${maximumPosition}.` },
        { status: 400 }
      );
    } else {
      finalPosition = value.finalPosition;
    }
    const leagueTitle = finalPosition === 1 ? 1 : 0;
    const maximumPoints = competitionMode === "invincible" ? 114 : 15;
    const maximumGoals = competitionMode === "invincible" ? 300 : 100;

    normalizedRows.push({
      p_profile_id: profile.id,
      p_display_name: profile.display_name,
      p_competition_mode: competitionMode,
      p_run_id: runId,
      p_source_record_id: competitionMode === "invincible"
        ? `result:${runId}`
        : typeof value.id === "string" && value.id.trim()
          ? value.id.trim().slice(0, 240)
          : runId,
      p_games_played: competitionMode === "invincible" ? 38 : 5,
      p_final_position: finalPosition,
      p_match_points: clampInt(value.matchPoints, 0, maximumPoints),
      p_goal_difference: clampInt(value.goalDifference, -maximumGoals, maximumGoals),
      p_goals_for: clampInt(value.goalsFor, 0, maximumGoals),
      p_league_titles: leagueTitle,
      p_opponent_strength: clampInt(value.opponentStrength, 0, 10000, 1000),
      p_completed_at: completedAt
    });
  }

  for (const row of normalizedRows) {
    const { error: writeError } = await supabase.rpc("record_competition_result", row);
    if (writeError) {
      if (isCompetitionSchemaMissing(writeError) && row.p_competition_mode === "minileague") {
        const { error: fallbackError } = await writeLegacyMiniLeagueResult(supabase, row);
        if (!fallbackError) {
          continue;
        }
      }
      if (isCompetitionSchemaMissing(writeError)) {
        return NextResponse.json(
          {
            error: "Account result storage is being upgraded. Please retry shortly.",
            code: "competition_schema_upgrade_required"
          },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: "Could not record result." }, { status: 500 });
    }
  }

  return NextResponse.json({
    persisted: true,
    count: normalizedRows.length,
    runIds: normalizedRows.map((row) => String(row.p_run_id))
  });
}

/** Return only the authenticated manager's durable competition history. */
export async function GET(request: NextRequest) {
  const limit = await rateLimit(request, "results-read", { limit: 120, window: "1 h" });
  if (!limit.success) {
    return tooManyRequests(limit);
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Results service is unavailable.", production: false }, { status: 503 });
  }

  const profileId = await getAuthenticatedUserId(request);
  if (!profileId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const requestedLimit = boundedQueryInt(request.nextUrl.searchParams.get("limit"), 1, 500, 100);
  const cursorAt = request.nextUrl.searchParams.get("cursorAt");
  const cursorId = request.nextUrl.searchParams.get("cursorId");
  const cursorTimestamp = cursorAt ? Date.parse(cursorAt) : Number.NaN;
  const validCursorId = cursorId ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cursorId) : false;
  if ((cursorAt || cursorId) && (!cursorAt || !cursorId || !Number.isFinite(cursorTimestamp) || !validCursorId)) {
    return NextResponse.json({ error: "Invalid competition history cursor." }, { status: 400 });
  }

  let query = supabase
    .from("leaderboard_entries")
    .select(
      "id, profile_id, display_name, kind, competition_mode, run_id, games_played, final_position, match_points, goal_difference, goals_for, league_titles, opponent_strength, completed_at"
    )
    .eq("profile_id", profileId)
    .order("completed_at", { ascending: false })
    .order("id", { ascending: false });
  if (cursorAt && cursorId) {
    const normalizedCursorAt = new Date(cursorTimestamp).toISOString();
    query = query.or(
      `completed_at.lt.${normalizedCursorAt},and(completed_at.eq.${normalizedCursorAt},id.lt.${cursorId})`
    );
  }
  const { data, error } = await query.limit(requestedLimit);

  if (error) {
    if (isCompetitionSchemaMissing(error)) {
      let legacyQuery = supabase
        .from("leaderboard_entries")
        .select(
          "id, profile_id, display_name, kind, match_points, goal_difference, goals_for, league_titles, opponent_strength, completed_at"
        )
        .eq("profile_id", profileId)
        .order("completed_at", { ascending: false })
        .order("id", { ascending: false });
      if (cursorAt && cursorId) {
        const normalizedCursorAt = new Date(cursorTimestamp).toISOString();
        legacyQuery = legacyQuery.or(
          `completed_at.lt.${normalizedCursorAt},and(completed_at.eq.${normalizedCursorAt},id.lt.${cursorId})`
        );
      }
      const { data: legacyData, error: legacyError } = await legacyQuery.limit(requestedLimit);
      if (!legacyError) {
        const records = ((legacyData as LegacyEntryRow[] | null) ?? []).map(legacyToRecord);
        const last = records.at(-1);
        const nextCursor = records.length === requestedLimit && last
          ? { completedAt: last.completedAt, id: last.id }
          : null;
        return NextResponse.json({ records, production: true, degraded: true, nextCursor });
      }
    }
    return NextResponse.json({ error: "Could not load competition history." }, { status: 500 });
  }

  const records = ((data as EntryRow[] | null) ?? []).map((row) => toRecord(row));
  const last = records.at(-1);
  const nextCursor = records.length === requestedLimit && last
    ? { completedAt: last.completedAt, id: last.id }
    : null;
  return NextResponse.json({ records, production: true, nextCursor });
}
