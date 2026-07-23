import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/server/auth";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const runIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;

function integer(value: unknown, min: number, max: number): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

export async function POST(request: Request) {
  const limit = await rateLimit(request, "account-activity", { limit: 180, window: "1 h" });
  if (!limit.success) return tooManyRequests(limit);
  const profileId = await getAuthenticatedUserId(request);
  if (!profileId) return NextResponse.json({ ok: false }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.kind !== "string") {
    return NextResponse.json({ ok: false, reason: "Invalid activity update." }, { status: 400 });
  }
  const supabase = getSupabaseServiceClient();
  if (!supabase) return NextResponse.json({ ok: false }, { status: 503 });
  const now = new Date();

  if (body.kind === "visit") {
    const visitId = typeof body.visitId === "string" ? body.visitId : "";
    const activeSeconds = integer(body.activeSeconds, 0, 86_400);
    const locale = ["en", "es", "fr", "pt"].includes(String(body.locale)) ? String(body.locale) : "en";
    const deviceClass = ["mobile", "tablet", "desktop"].includes(String(body.deviceClass))
      ? String(body.deviceClass)
      : "desktop";
    if (!uuidPattern.test(visitId) || activeSeconds === null) {
      return NextResponse.json({ ok: false, reason: "Invalid visit update." }, { status: 400 });
    }
    const existing = await supabase
      .from("user_visits")
      .select("profile_id, active_seconds, started_at")
      .eq("id", visitId)
      .maybeSingle();
    if (existing.error) return NextResponse.json({ ok: false }, { status: 500 });
    if (existing.data && existing.data.profile_id !== profileId) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }
    if (!existing.data) {
      const { error } = await supabase.from("user_visits").insert({
        id: visitId,
        profile_id: profileId,
        started_at: now.toISOString(),
        last_activity_at: now.toISOString(),
        active_seconds: Math.min(activeSeconds, 60),
        locale,
        device_class: deviceClass
      });
      if (error) return NextResponse.json({ ok: false }, { status: 500 });
    } else {
      const maximumByAge = Math.min(
        86_400,
        Math.max(0, Math.floor((now.getTime() - Date.parse(existing.data.started_at)) / 1000) + 60)
      );
      const nextSeconds = Math.min(
        Math.max(Number(existing.data.active_seconds), activeSeconds),
        Number(existing.data.active_seconds) + 120,
        maximumByAge
      );
      const { error } = await supabase.from("user_visits").update({
        last_activity_at: now.toISOString(),
        active_seconds: nextSeconds,
        locale,
        device_class: deviceClass
      }).eq("id", visitId).eq("profile_id", profileId);
      if (error) return NextResponse.json({ ok: false }, { status: 500 });
    }
    await supabase.from("profiles").update({ last_seen_at: now.toISOString(), locale }).eq("id", profileId);
    return NextResponse.json({ ok: true });
  }

  const runId = typeof body.runId === "string" ? body.runId : "";
  const mode = ["minileague", "invincible", "exhibition"].includes(String(body.mode))
    ? String(body.mode)
    : null;
  if (!runIdPattern.test(runId) || !mode) {
    return NextResponse.json({ ok: false, reason: "Invalid run activity." }, { status: 400 });
  }
  const existing = await supabase
    .from("user_mode_runs")
    .select("id, profile_id, mode, matches_played, completed_at")
    .eq("profile_id", profileId)
    .eq("run_id", runId)
    .maybeSingle();
  if (existing.error) return NextResponse.json({ ok: false }, { status: 500 });

  if (body.kind === "run_started") {
    if (!existing.data) {
      const { error } = await supabase.from("user_mode_runs").insert({
        profile_id: profileId,
        run_id: runId,
        mode,
        started_at: now.toISOString()
      });
      if (error?.code !== "23505" && error) return NextResponse.json({ ok: false }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }
  if (!existing.data || existing.data.mode !== mode) {
    return NextResponse.json({ ok: false, reason: "Run was not started." }, { status: 409 });
  }

  const patch: Record<string, unknown> = {};
  if (body.kind === "draft_completed") patch.draft_completed_at = now.toISOString();
  else if (body.kind === "match_completed") {
    const submitted = integer(body.matchesPlayed, 1, 38);
    patch.matches_played = submitted ?? Math.min(38, Number(existing.data.matches_played) + 1);
  } else if (body.kind === "run_completed") {
    patch.completed_at = existing.data.completed_at ?? now.toISOString();
    patch.abandoned_at = null;
    patch.matches_played = mode === "invincible" ? 38 : mode === "minileague" ? 5 : 1;
    patch.outcome = ["win","draw","loss","completed","unbeaten"].includes(String(body.outcome))
      ? body.outcome
      : "completed";
    patch.title_won = body.titleWon === true;
  } else if (body.kind === "run_abandoned") {
    if (!existing.data.completed_at) patch.abandoned_at = now.toISOString();
  } else {
    return NextResponse.json({ ok: false, reason: "Unsupported activity update." }, { status: 400 });
  }
  const { error } = await supabase.from("user_mode_runs").update(patch)
    .eq("profile_id", profileId).eq("run_id", runId);
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true });
}
