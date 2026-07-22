import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getLocalInvincibleStore } from "@/lib/game/invincible-local-store";

vi.mock("@/lib/server/rate-limit", () => ({
  rateLimit: vi.fn().mockResolvedValue({ success: true }),
  tooManyRequests: vi.fn(() => Response.json({}, { status: 429 }))
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServiceClient: vi.fn(() => null)
}));

vi.mock("@/lib/server/auth", () => ({
  getAuthenticatedUserId: vi.fn().mockResolvedValue(null)
}));

vi.mock("@/lib/server/request", () => ({
  requestIpHash: vi.fn(() => "test-ip")
}));

import { POST } from "@/app/api/invincible-attempts/[attemptId]/complete/route";

function completionRequest(body: unknown) {
  return new NextRequest("http://localhost/api/invincible-attempts/attempt-1/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

const completeSeason = {
  unbeaten: true,
  points: 98,
  wins: 30,
  draws: 8,
  losses: 0,
  goalDifference: 52,
  goalsFor: 91,
  finalPosition: 1
};

describe("Invincible completion verification", () => {
  beforeEach(() => {
    const store = getLocalInvincibleStore();
    store.attempts.clear();
    store.participants.clear();
    store.attempts.set("attempt-1", {
      id: "attempt-1",
      participantKey: "guest:test-ip",
      attemptNumber: 1,
      userCountSnapshot: 1,
      targetOddsSnapshot: 1000,
      eligible: true,
      startedAt: "2026-07-22T12:00:00.000Z"
    });
  });

  it("refuses to complete an attempt without a consistent 38-match record", async () => {
    const response = await POST(
      completionRequest({ ...completeSeason, wins: 0, draws: 0, points: 0 }),
      { params: Promise.resolve({ attemptId: "attempt-1" }) }
    );

    expect(response.status).toBe(400);
    expect(getLocalInvincibleStore().attempts.get("attempt-1")?.completedAt).toBeUndefined();
  });

  it("stores the verified finish used by account progress and league wins", async () => {
    const response = await POST(
      completionRequest(completeSeason),
      { params: Promise.resolve({ attemptId: "attempt-1" }) }
    );

    expect(response.status).toBe(200);
    expect(getLocalInvincibleStore().attempts.get("attempt-1")).toMatchObject({
      completedAt: expect.any(String),
      unbeaten: true,
      officialAward: true,
      goalsFor: 91,
      finalPosition: 1
    });
  });

  it("lets a pre-deployment client finish safely as a partial historical result", async () => {
    const legacySeason: Record<string, unknown> = { ...completeSeason };
    delete legacySeason.goalsFor;
    delete legacySeason.finalPosition;
    const response = await POST(
      completionRequest(legacySeason),
      { params: Promise.resolve({ attemptId: "attempt-1" }) }
    );

    expect(response.status).toBe(200);
    expect(getLocalInvincibleStore().attempts.get("attempt-1")).toMatchObject({
      completedAt: expect.any(String),
      unbeaten: true,
      officialAward: true
    });
    expect(getLocalInvincibleStore().attempts.get("attempt-1")?.finalPosition).toBeUndefined();
  });
});
