import { describe, expect, it } from "vitest";
import {
  INVINCIBLE_JITTER,
  evaluateInvincibleEligibility,
  jitterMultiplierForAttempt,
  officialInvincibleAward,
  targetOddsForUserCount
} from "@/lib/game/invincible-gate";

describe("Invincible rarity gate", () => {
  it("uses a saturating logarithmic target curve", () => {
    expect(targetOddsForUserCount(1)).toBeCloseTo(1000, 5);
    expect(targetOddsForUserCount(1000)).toBeGreaterThan(targetOddsForUserCount(1));
    expect(targetOddsForUserCount(10000)).toBeGreaterThan(targetOddsForUserCount(1000));
    expect(targetOddsForUserCount(100000)).toBeCloseTo(100000, 5);
    expect(targetOddsForUserCount(200000)).toBeCloseTo(100000, 5);

    const earlyStep = targetOddsForUserCount(1000) - targetOddsForUserCount(1);
    const lateStep = targetOddsForUserCount(100000) - targetOddsForUserCount(99001);
    expect(earlyStep).toBeGreaterThan(lateStep);
  });

  it("keeps deterministic jitter within the configured bounds", () => {
    for (const attemptId of ["a", "b", "c", "d"]) {
      const jitter = jitterMultiplierForAttempt(attemptId, "test-secret");
      expect(jitter).toBeGreaterThanOrEqual(1 - INVINCIBLE_JITTER);
      expect(jitter).toBeLessThanOrEqual(1 + INVINCIBLE_JITTER);
      expect(jitterMultiplierForAttempt(attemptId, "test-secret")).toBe(jitter);
    }
  });

  it("evaluates eligibility deterministically without exposing it before completion", () => {
    const first = evaluateInvincibleEligibility({ attemptId: "attempt-123", userCount: 10000, secret: "secret" });
    const second = evaluateInvincibleEligibility({ attemptId: "attempt-123", userCount: 10000, secret: "secret" });
    expect(second).toEqual(first);
    expect(first.jitteredTargetOdds).toBeGreaterThan(0);
    expect(first.roll).toBeGreaterThanOrEqual(0);
    expect(first.roll).toBeLessThan(1);
  });

  it("requires both eligibility and an unbeaten season for the official award", () => {
    expect(officialInvincibleAward(true, true)).toBe(true);
    expect(officialInvincibleAward(true, false)).toBe(false);
    expect(officialInvincibleAward(false, true)).toBe(false);
    expect(officialInvincibleAward(false, false)).toBe(false);
  });
});
