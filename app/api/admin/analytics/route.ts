import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/account";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const MIN_AUDIENCE_SEGMENT = 10;

export function grouped(rows: Record<string, unknown>[], key: string) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const value = row[key];
    const values = Array.isArray(value) ? value : [value];
    values.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .forEach((item) => counts.set(item, (counts.get(item) ?? 0) + 1));
  });
  return [...counts.entries()]
    .filter(([, count]) => count >= MIN_AUDIENCE_SEGMENT)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

export async function GET(request: Request) {
  if (!(await requireAdmin(request))) return NextResponse.json({ ok: false }, { status: 403 });
  const supabase = getSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ ok: false }, { status: 503 });
  const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();
  const [profiles, visits, runs, preferences, marketing] = await Promise.all([
    supabase.from("profiles").select("id, created_at"),
    supabase.from("user_visits").select("profile_id, started_at, last_activity_at, active_seconds").gte("started_at", since30),
    supabase.from("user_mode_runs").select("profile_id, mode, completed_at, started_at"),
    supabase.from("profile_preferences").select("*"),
    supabase.from("marketing_preferences").select("profile_id, footyrush_email_opt_in")
  ]);
  const error = [profiles.error, visits.error, runs.error, preferences.error, marketing.error].find(Boolean);
  if (error) return NextResponse.json({ ok: false, reason: "Could not build account analytics." }, { status: 500 });
  const now = Date.now();
  const activeSince = (days: number) => new Set((visits.data ?? [])
    .filter((visit) => Date.parse(visit.last_activity_at) >= now - days * 86400_000)
    .map((visit) => visit.profile_id)).size;
  const runsRows = runs.data ?? [];
  const retentionCohort = (profiles.data ?? []).filter((profile) => {
    const created = Date.parse(profile.created_at);
    return created >= now - 14 * 86400_000 && created < now - 7 * 86400_000;
  });
  const activeLastWeek = new Set((visits.data ?? [])
    .filter((visit) => Date.parse(visit.last_activity_at) >= now - 7 * 86400_000)
    .map((visit) => visit.profile_id));
  const retainedCohort = retentionCohort.filter((profile) => activeLastWeek.has(profile.id)).length;
  const modeStats = ["minileague", "invincible", "exhibition"].map((mode) => {
    const rows = runsRows.filter((run) => run.mode === mode);
    const completions = rows.filter((run) => run.completed_at).length;
    return { mode, starts: rows.length, completions, completionRate: rows.length ? completions / rows.length : 0 };
  });
  const optedAudience = (preferences.data ?? []).filter((row) => row.audience_insights_opt_in);
  const totalActiveSeconds = (visits.data ?? []).reduce((sum, visit) => sum + Number(visit.active_seconds || 0), 0);
  return NextResponse.json({
    ok: true,
    minimumAudienceSegment: MIN_AUDIENCE_SEGMENT,
    metrics: {
      totalUsers: (profiles.data ?? []).length,
      newUsers7d: (profiles.data ?? []).filter((profile) => Date.parse(profile.created_at) >= now - 7 * 86400_000).length,
      dau: activeSince(1),
      wau: activeSince(7),
      mau: activeSince(30),
      activeSeconds30d: totalActiveSeconds,
      averageVisitSeconds: (visits.data ?? []).length ? Math.round(totalActiveSeconds / (visits.data ?? []).length) : 0,
      retention7dPercent: retentionCohort.length
        ? Math.round((retainedCohort / retentionCohort.length) * 100)
        : 0,
      emailOptIns: (marketing.data ?? []).filter((row) => row.footyrush_email_opt_in).length,
      audienceInsightOptIns: optedAudience.length
    },
    modeStats,
    audience: {
      countries: grouped(optedAudience, "country_code"),
      ageBands: grouped(optedAudience, "age_band"),
      genders: grouped(optedAudience, "gender"),
      clubs: grouped(optedAudience, "favourite_club_code"),
      currentPlayers: grouped(optedAudience, "favourite_current_player"),
      legends: grouped(optedAudience, "favourite_legend"),
      leagues: grouped(optedAudience, "followed_leagues"),
      preferredModes: grouped(optedAudience, "preferred_game_mode"),
      discoverySources: grouped(optedAudience, "discovery_source"),
      kitStyles: grouped(optedAudience, "preferred_kit_style")
    }
  });
}
