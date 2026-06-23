import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { evaluateInvincibleEligibility } from "@/lib/game/invincible-gate";
import { getLocalInvincibleStore } from "@/lib/game/invincible-local-store";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/server/auth";
import { getServerEnv } from "@/lib/server/env";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { requestIpHash } from "@/lib/server/request";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const limit = await rateLimit(request, "invincible-create", { limit: 20, window: "1 h" });
  if (!limit.success) {
    return tooManyRequests(limit);
  }

  // Identity comes from the verified Supabase token, never the request body.
  const userId = await getAuthenticatedUserId(request);
  const key = userId ? `profile:${userId}` : `guest:${requestIpHash(request)}`;
  const supabase = getSupabaseServiceClient();
  const attemptId = randomUUID();
  const gateSecret = getServerEnv().invincibleGateSecret;

  if (!supabase) {
    const store = getLocalInvincibleStore();
    store.participants.add(key);
    const attemptNumber = Array.from(store.attempts.values()).filter((attempt) => attempt.participantKey === key).length + 1;
    const userCountSnapshot = Math.max(1, store.participants.size);
    const gate = evaluateInvincibleEligibility({ attemptId, userCount: userCountSnapshot, secret: gateSecret });
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
  const gate = evaluateInvincibleEligibility({ attemptId, userCount: userCountSnapshot, secret: gateSecret });
  const { error } = await supabase.from("invincible_attempts").insert({
    id: attemptId,
    profile_id: userId,
    guest_hash: userId ? null : requestIpHash(request),
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
