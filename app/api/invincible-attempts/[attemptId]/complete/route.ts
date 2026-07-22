import { NextRequest, NextResponse } from "next/server";
import { officialInvincibleAward } from "@/lib/game/invincible-gate";
import { getLocalInvincibleStore } from "@/lib/game/invincible-local-store";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/server/auth";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { requestIpHash } from "@/lib/server/request";

export const runtime = "nodejs";

// A Be Invincible season is a 38-game double round-robin (20 teams).
const SEASON_GAMES = 38;

interface CompletionBody {
  unbeaten?: boolean;
  points?: number;
  wins?: number;
  draws?: number;
  losses?: number;
  goalDifference?: number;
  goalsFor?: number;
  finalPosition?: number;
}

interface NormalizedResult {
  wins: number;
  draws: number;
  losses: number;
  points: number;
  goalDifference: number;
  goalsFor: number | null;
  finalPosition: number | null;
  /** Server-recomputed: a genuine, complete, loss-free season. */
  unbeaten: boolean;
}

/**
 * Never trust the client's `unbeaten` flag. Derive it from the reported W/D/L,
 * and only honour it when the figures describe a *complete* 38-game season with
 * internally consistent points (W*3 + D). Anything else cannot earn an award.
 */
function integerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum;
}

function normalizeResult(body: CompletionBody): NormalizedResult | null {
  const legacyShape = body.goalsFor === undefined && body.finalPosition === undefined;
  if (
    !integerInRange(body.wins, 0, SEASON_GAMES) ||
    !integerInRange(body.draws, 0, SEASON_GAMES) ||
    !integerInRange(body.losses, 0, SEASON_GAMES) ||
    !integerInRange(body.points, 0, SEASON_GAMES * 3) ||
    !integerInRange(body.goalDifference, -300, 300) ||
    (!legacyShape && !integerInRange(body.goalsFor, 0, 300)) ||
    (!legacyShape && !integerInRange(body.finalPosition, 1, 20))
  ) {
    return null;
  }

  const { wins, draws, losses, points, goalDifference } = body;
  const goalsFor = legacyShape ? null : body.goalsFor as number;
  const finalPosition = legacyShape ? null : body.finalPosition as number;

  const totalGames = wins + draws + losses;
  const pointsConsistent = points === wins * 3 + draws;
  const seasonComplete = totalGames === SEASON_GAMES;
  const goalDifferenceConsistent = goalsFor === null || goalsFor - goalDifference >= 0;
  const championPointsPlausible = finalPosition !== 1 || points >= SEASON_GAMES;
  if (!seasonComplete || !pointsConsistent || !goalDifferenceConsistent || !championPointsPlausible) {
    return null;
  }
  const unbeaten = seasonComplete && losses === 0 && pointsConsistent;

  return { wins, draws, losses, points, goalDifference, goalsFor, finalPosition, unbeaten };
}

export async function POST(request: NextRequest, context: { params: Promise<{ attemptId: string }> }) {
  const limit = await rateLimit(request, "invincible-complete", { limit: 30, window: "1 h" });
  if (!limit.success) {
    return tooManyRequests(limit);
  }

  const { attemptId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as CompletionBody;
  const result = normalizeResult(body);
  if (!result) {
    return NextResponse.json({ error: "A complete, internally consistent 38-match result is required." }, { status: 400 });
  }
  const completedAt = new Date().toISOString();
  const supabase = getSupabaseServiceClient();
  const userId = await getAuthenticatedUserId(request);

  if (!supabase) {
    // Demo/dev fallback: only honour an attempt that this process actually
    // created, and never re-roll a completed one. Unknown ids are 404 (no
    // on-the-fly eligibility grinding).
    const store = getLocalInvincibleStore();
    const attempt = store.attempts.get(attemptId);
    if (!attempt) {
      return NextResponse.json({ error: "Invincible attempt not found." }, { status: 404 });
    }
    if (attempt.completedAt) {
      return NextResponse.json({ officialAward: Boolean(attempt.officialAward), production: false, alreadyCompleted: true });
    }
    const officialAward = officialInvincibleAward(attempt.eligible, result.unbeaten);
    store.attempts.set(attemptId, {
      ...attempt,
      completedAt,
      unbeaten: result.unbeaten,
      officialAward,
      goalsFor: result.goalsFor ?? undefined,
      finalPosition: result.finalPosition ?? undefined
    });
    return NextResponse.json({ officialAward, unbeaten: result.unbeaten, production: false });
  }

  const { data: attempt, error: fetchError } = await supabase
    .from("invincible_attempts")
    .select("eligible, participant_key, completed_at, official_award")
    .eq("id", attemptId)
    .single();

  if (fetchError || !attempt) {
    return NextResponse.json({ error: "Invincible attempt not found." }, { status: 404 });
  }

  // Replay-safe: a completed attempt is immutable. Return the recorded outcome.
  if (attempt.completed_at) {
    return NextResponse.json({
      officialAward: Boolean(attempt.official_award),
      production: true,
      alreadyCompleted: true
    });
  }

  // Mandatory, unforgeable binding. Guest attempts must complete from the same
  // hashed IP; profile attempts require a verified token whose user id matches
  // the attempt's participant. The check is NOT gated on a client-supplied field.
  const participantKey = String(attempt.participant_key ?? "");
  if (participantKey.startsWith("guest:")) {
    if (participantKey !== `guest:${requestIpHash(request)}`) {
      return NextResponse.json({ error: "This attempt belongs to a different session." }, { status: 403 });
    }
  } else if (participantKey.startsWith("profile:")) {
    if (!userId || participantKey !== `profile:${userId}`) {
      return NextResponse.json({ error: "Sign in as the owning account to complete this attempt." }, { status: 403 });
    }
  }

  const officialAward = officialInvincibleAward(Boolean(attempt.eligible), result.unbeaten);
  const { data: updated, error: updateError } = await supabase
    .from("invincible_attempts")
    .update({
      completed_at: completedAt,
      unbeaten: result.unbeaten,
      official_award: officialAward,
      points: result.points,
      wins: result.wins,
      draws: result.draws,
      losses: result.losses,
      goal_difference: result.goalDifference,
      goals_for: result.goalsFor,
      final_position: result.finalPosition
    })
    .eq("id", attemptId)
    .is("completed_at", null) // guard against a concurrent double-complete race
    .select("official_award");

  if (updateError) {
    return NextResponse.json({ error: "Could not complete Invincible attempt." }, { status: 500 });
  }

  // Lost the race (a concurrent request completed it first): the UPDATE matched
  // zero rows. Return the authoritative persisted value, not this request's body.
  if (!updated || updated.length === 0) {
    const { data: fresh } = await supabase
      .from("invincible_attempts")
      .select("official_award")
      .eq("id", attemptId)
      .single();
    return NextResponse.json({
      officialAward: Boolean(fresh?.official_award),
      production: true,
      alreadyCompleted: true
    });
  }

  return NextResponse.json({ officialAward, unbeaten: result.unbeaten, production: true });
}
