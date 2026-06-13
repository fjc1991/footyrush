import { describe, expect, it } from "vitest";
import {
  EXPERT_SCORE_THRESHOLD,
  STARTING_MANAGER_SCORE,
  expertProgress,
  hasExpertAccess,
  isExpertUnlocked,
  scoreDeltaForStanding
} from "@/lib/game/progression";

describe("manager progression", () => {
  it("unlocks expert drafting only at the score threshold", () => {
    expect(isExpertUnlocked(EXPERT_SCORE_THRESHOLD - 1)).toBe(false);
    expect(isExpertUnlocked(EXPERT_SCORE_THRESHOLD)).toBe(true);
  });

  it("keeps expert access once it has already been earned", () => {
    expect(hasExpertAccess(EXPERT_SCORE_THRESHOLD - 40, true)).toBe(true);
    expect(hasExpertAccess(EXPERT_SCORE_THRESHOLD - 40, false)).toBe(false);
  });

  it("reports bounded progress toward expert mode", () => {
    expect(expertProgress(STARTING_MANAGER_SCORE)).toBe(0);
    expect(expertProgress(EXPERT_SCORE_THRESHOLD)).toBe(100);
    expect(expertProgress(EXPERT_SCORE_THRESHOLD + 200)).toBe(100);
  });

  it("rewards strong league results and punishes poor ones", () => {
    const strong = scoreDeltaForStanding({ points: 11, goalDifference: 5, goalsFor: 9 }, true);
    const poor = scoreDeltaForStanding({ points: 1, goalDifference: -7, goalsFor: 2 }, false);

    expect(strong).toBeGreaterThan(25);
    expect(poor).toBeLessThan(-10);
  });
});
