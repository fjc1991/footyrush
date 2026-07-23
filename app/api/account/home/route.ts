import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/server/auth";
import { isAccountSchemaMissing } from "@/lib/server/account";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ ok: false, reason: "Authentication required." }, { status: 401 });
  const supabase = getSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ ok: false, available: false }, { status: 503 });

  const profileResult = await supabase
    .from("profiles")
    .select("id, manager_id, display_name, email, locale, created_at, last_seen_at")
    .eq("id", user.id)
    .maybeSingle();
  if (profileResult.error || !profileResult.data) {
    return NextResponse.json({ ok: false, reason: "Profile not found." }, { status: 404 });
  }

  const [preferences, marketing, visits, runs, results] = await Promise.all([
    supabase.from("profile_preferences").select("*").eq("profile_id", user.id).maybeSingle(),
    supabase.from("marketing_preferences").select("*").eq("profile_id", user.id).maybeSingle(),
    supabase.from("user_visits").select("active_seconds, started_at, last_activity_at").eq("profile_id", user.id),
    supabase.from("user_mode_runs").select("mode, matches_played, completed_at, abandoned_at").eq("profile_id", user.id),
    supabase.from("leaderboard_entries")
      .select("competition_mode, match_points, goal_difference, goals_for, league_titles, final_position, completed_at")
      .eq("profile_id", user.id)
      .order("completed_at", { ascending: false })
      .limit(10)
  ]);
  const firstError = [preferences.error, marketing.error, visits.error, runs.error, results.error].find(Boolean);
  if (firstError && isAccountSchemaMissing(firstError)) {
    return NextResponse.json({
      ok: true,
      available: false,
      profile: {
        managerId: profileResult.data.manager_id,
        publicName: profileResult.data.manager_id ? `@${profileResult.data.manager_id}` : null,
        email: profileResult.data.email,
        emailVerified: Boolean(user.email_confirmed_at),
        locale: profileResult.data.locale,
        joinedAt: profileResult.data.created_at
      }
    });
  }
  if (firstError) {
    return NextResponse.json({ ok: false, reason: "Account statistics are temporarily unavailable." }, { status: 500 });
  }

  const visitRows = visits.data ?? [];
  const runRows = runs.data ?? [];
  const byMode = (mode: string) => {
    const rows = runRows.filter((run) => run.mode === mode);
    return {
      starts: rows.length,
      completions: rows.filter((run) => Boolean(run.completed_at)).length,
      abandoned: rows.filter((run) => Boolean(run.abandoned_at)).length,
      matches: rows.reduce((sum, run) => sum + Number(run.matches_played || 0), 0)
    };
  };
  const performanceRows = results.data ?? [];
  return NextResponse.json({
    ok: true,
    available: true,
    profile: {
      managerId: profileResult.data.manager_id,
      publicName: profileResult.data.manager_id ? `@${profileResult.data.manager_id}` : null,
      email: profileResult.data.email,
      emailVerified: Boolean(user.email_confirmed_at),
      locale: profileResult.data.locale,
      joinedAt: profileResult.data.created_at,
      lastSeenAt: profileResult.data.last_seen_at
    },
    activity: {
      visits: visitRows.length,
      activeSeconds: visitRows.reduce((sum, visit) => sum + Number(visit.active_seconds || 0), 0),
      minileague: byMode("minileague"),
      invincible: byMode("invincible"),
      exhibitions: byMode("exhibition")
    },
    performance: {
      completedRuns: performanceRows.length,
      titles: performanceRows.reduce((sum, row) => sum + Number(row.league_titles || 0), 0),
      bestPoints: performanceRows.reduce((best, row) => Math.max(best, Number(row.match_points || 0)), 0),
      recentRuns: performanceRows
    },
    preferences: preferences.data ?? null,
    marketing: marketing.data ?? {
      footyrush_email_opt_in: false,
      consented_at: null,
      withdrawn_at: null,
      policy_version: "2026-07"
    }
  });
}
