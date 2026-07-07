import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/server/auth";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SquadBody {
  squad?: {
    picks?: unknown[];
    managerRating?: number;
    [key: string]: unknown;
  };
}

function clampInt(value: unknown, min: number, max: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/**
 * Save a completed squad so other real players can face it in the end-of-season
 * one-off. Only registered (token-verified) users contribute; guests stay local.
 */
export async function POST(request: NextRequest) {
  const limit = await rateLimit(request, "community-save", { limit: 30, window: "1 h" });
  if (!limit.success) {
    return tooManyRequests(limit);
  }

  const userId = await getAuthenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ saved: false, reason: "Sign in to share your squad." });
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json({ saved: false, production: false });
  }

  const body = (await request.json().catch(() => ({}))) as SquadBody;
  const squad = body.squad;
  if (!squad || !Array.isArray(squad.picks) || squad.picks.length === 0 || squad.picks.length > 25) {
    return NextResponse.json({ saved: false, reason: "Invalid squad." }, { status: 400 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: "Could not verify profile." }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ saved: false, reason: "Unknown profile." }, { status: 404 });
  }

  const { error: insertError } = await supabase.from("community_squads").insert({
    profile_id: profile.id,
    display_name: profile.display_name,
    manager_rating: clampInt(squad.managerRating, 0, 100000),
    squad
  });

  if (insertError) {
    return NextResponse.json({ error: "Could not save squad." }, { status: 500 });
  }

  return NextResponse.json({ saved: true });
}

/**
 * Return a random community squad to face, excluding the caller's own squads.
 * Returns { squad: null } when none exist (client falls back to a local/demo opponent).
 */
export async function GET(request: NextRequest) {
  const limit = await rateLimit(request, "community-fetch", { limit: 60, window: "1 m" });
  if (!limit.success) {
    return tooManyRequests(limit);
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json({ squad: null, production: false });
  }

  const userId = await getAuthenticatedUserId(request);
  let query = supabase
    .from("community_squads")
    .select("display_name, manager_rating, squad")
    .order("created_at", { ascending: false })
    .limit(100);
  if (userId) {
    query = query.neq("profile_id", userId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ squad: null, production: true, degraded: true });
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ squad: null, production: true });
  }

  const chosen = rows[Math.floor(Math.random() * rows.length)];
  // Stamp the authoritative display name onto the returned squad blob.
  const squad = { ...(chosen.squad as Record<string, unknown>), displayName: chosen.display_name };
  return NextResponse.json({ squad, production: true });
}
