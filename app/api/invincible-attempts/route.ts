import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { evaluateInvincibleEligibility } from "@/lib/game/invincible-gate";
import { getLocalInvincibleStore } from "@/lib/game/invincible-local-store";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function requestIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local-dev"
  );
}

function hashIp(ip: string): string {
  const salt = process.env.FOOTYRUSH_IP_HASH_SALT || "local-footyrush-dev";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

function participantKey(request: NextRequest, profileId?: string): string {
  return profileId ? `profile:${profileId}` : `guest:${hashIp(requestIp(request))}`;
}

function uuidOrNull(value?: string): string | null {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function gateSecret(): string {
  return process.env.INVINCIBLE_GATE_SECRET || "local-footyrush-invincible-dev";
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { profileId?: string };
  const key = participantKey(request, body.profileId);
  const supabase = getSupabaseServiceClient();
  const attemptId = randomUUID();

  if (!supabase) {
    const store = getLocalInvincibleStore();
    store.participants.add(key);
    const attemptNumber = Array.from(store.attempts.values()).filter((attempt) => attempt.participantKey === key).length + 1;
    const userCountSnapshot = Math.max(1, store.participants.size);
    const gate = evaluateInvincibleEligibility({ attemptId, userCount: userCountSnapshot, secret: gateSecret() });
    store.attempts.set(attemptId, {
      id: attemptId,
      participantKey: key,
      attemptNumber,
      userCountSnapshot,
      targetOddsSnapshot: gate.jitteredTargetOdds,
      eligible: gate.eligible,
      startedAt: new Date().toISOString()
    });
    return NextResponse.json({ attemptId });
  }

  const [{ count: participantAttemptCount, error: attemptCountError }, distinctResult] = await Promise.all([
    supabase.from("invincible_attempts").select("id", { count: "exact", head: true }).eq("participant_key", key),
    supabase.rpc("invincible_distinct_user_count")
  ]);

  if (attemptCountError || distinctResult.error) {
    return NextResponse.json({ error: "Could not create Invincible attempt." }, { status: 500 });
  }

  const existingUsers = Number(distinctResult.data ?? 0);
  const userCountSnapshot = Math.max(1, existingUsers + ((participantAttemptCount ?? 0) === 0 ? 1 : 0));
  const attemptNumber = (participantAttemptCount ?? 0) + 1;
  const gate = evaluateInvincibleEligibility({ attemptId, userCount: userCountSnapshot, secret: gateSecret() });
  const { error } = await supabase.from("invincible_attempts").insert({
    id: attemptId,
    profile_id: uuidOrNull(body.profileId),
    guest_hash: body.profileId ? null : hashIp(requestIp(request)),
    participant_key: key,
    attempt_number: attemptNumber,
    user_count_snapshot: userCountSnapshot,
    target_odds_snapshot: gate.jitteredTargetOdds,
    eligible: gate.eligible
  });

  if (error) {
    return NextResponse.json({ error: "Could not create Invincible attempt." }, { status: 500 });
  }

  return NextResponse.json({ attemptId });
}
