import { NextRequest, NextResponse } from "next/server";
import type { LeaderboardRecord } from "@/lib/game/types";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/server/auth";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

interface ResultsBody {
  /** Records produced client-side by recordsFromLeague(). */
  records?: LeaderboardRecord[];
  completedAt?: string;
}

function clampInt(value: unknown, min: number, max: number, fallback = min): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function utcDate(iso: string): string {
  // period_start as a YYYY-MM-DD date (the run's day); read-time aggregation
  // re-buckets by completed_at, so this column is for schema/auditing only.
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * Persist a completed run to the public leaderboard. Only registered users
 * (resolvable profileId) land on the cross-user board; guests keep their local
 * history. Mini-League results are client-simulated, so figures are clamped to
 * sane bounds but cannot be fully trusted — a known limitation of the
 * client-side simulation architecture.
 */
export async function POST(request: NextRequest) {
  const limit = await rateLimit(request, "results", { limit: 30, window: "1 h" });
  if (!limit.success) {
    return tooManyRequests(limit);
  }

  const body = (await request.json().catch(() => ({}))) as ResultsBody;
  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json({ persisted: false, production: false });
  }

  // Identity from the verified Supabase token, never a client-supplied field.
  const profileId = await getAuthenticatedUserId(request);
  if (!profileId) {
    return NextResponse.json({ persisted: false, reason: "Sign in to appear on the public leaderboard." });
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
    return NextResponse.json({ persisted: false, reason: "Unknown profile." }, { status: 404 });
  }

  const completedAt = body.completedAt && !Number.isNaN(Date.parse(body.completedAt))
    ? new Date(body.completedAt).toISOString()
    : new Date().toISOString();

  const records = Array.isArray(body.records) ? body.records.filter((r) => r && r.kind === "human") : [];
  if (records.length === 0) {
    return NextResponse.json({ persisted: false, reason: "No human result to record." }, { status: 400 });
  }

  const rows = records.map((record) => ({
    profile_id: profile.id,
    display_name: profile.display_name,
    kind: "human" as const,
    period: "daily" as const,
    period_start: utcDate(completedAt),
    match_points: clampInt(record.matchPoints, 0, 1000),
    goal_difference: clampInt(record.goalDifference, -1000, 1000),
    goals_for: clampInt(record.goalsFor, 0, 1000),
    league_titles: clampInt(record.leagueTitles, 0, 100),
    opponent_strength: clampInt(record.opponentStrength, 0, 100000, 1000),
    completed_at: completedAt
  }));

  const { error: insertError } = await supabase.from("leaderboard_entries").insert(rows);
  if (insertError) {
    return NextResponse.json({ error: "Could not record result." }, { status: 500 });
  }

  return NextResponse.json({ persisted: true, count: rows.length });
}
