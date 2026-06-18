import { NextRequest, NextResponse } from "next/server";
import { evaluateInvincibleEligibility, officialInvincibleAward } from "@/lib/game/invincible-gate";
import { getLocalInvincibleStore } from "@/lib/game/invincible-local-store";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function gateSecret(): string {
  return process.env.INVINCIBLE_GATE_SECRET || "local-footyrush-invincible-dev";
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ attemptId: string }> }
) {
  const { attemptId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    unbeaten?: boolean;
    points?: number;
    wins?: number;
    draws?: number;
    losses?: number;
    goalDifference?: number;
  };
  const unbeaten = Boolean(body.unbeaten);
  const completedAt = new Date().toISOString();
  const supabase = getSupabaseServiceClient();

  if (!supabase) {
    const store = getLocalInvincibleStore();
    const attempt = store.attempts.get(attemptId);
    const gate =
      attempt ??
      ({
        id: attemptId,
        eligible: evaluateInvincibleEligibility({ attemptId, userCount: 1, secret: gateSecret() }).eligible,
        userCountSnapshot: 1
      } as const);
    const officialAward = officialInvincibleAward(gate.eligible, unbeaten);
    if (attempt) {
      store.attempts.set(attemptId, {
        ...attempt,
        completedAt,
        unbeaten,
        officialAward
      });
    }
    return NextResponse.json({ officialAward, production: false });
  }

  const { data: attempt, error: fetchError } = await supabase
    .from("invincible_attempts")
    .select("eligible")
    .eq("id", attemptId)
    .single();

  if (fetchError || !attempt) {
    return NextResponse.json({ error: "Invincible attempt not found." }, { status: 404 });
  }

  const officialAward = officialInvincibleAward(Boolean(attempt.eligible), unbeaten);
  const { error: updateError } = await supabase
    .from("invincible_attempts")
    .update({
      completed_at: completedAt,
      unbeaten,
      official_award: officialAward,
      points: Math.max(0, Math.round(body.points ?? 0)),
      wins: Math.max(0, Math.round(body.wins ?? 0)),
      draws: Math.max(0, Math.round(body.draws ?? 0)),
      losses: Math.max(0, Math.round(body.losses ?? 0)),
      goal_difference: Math.round(body.goalDifference ?? 0)
    })
    .eq("id", attemptId);

  if (updateError) {
    return NextResponse.json({ error: "Could not complete Invincible attempt." }, { status: 500 });
  }

  return NextResponse.json({ officialAward, production: true });
}
