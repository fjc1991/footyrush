import { describe, expect, it } from "vitest";
import {
  EXPERT_SCORE_THRESHOLD,
  STARTING_MANAGER_SCORE,
  careerMatchmakingScore,
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

  it("raises matchmaking difficulty through completed campaigns in either mode", () => {
    expect(careerMatchmakingScore(0, 0)).toBe(0);
    expect(careerMatchmakingScore(0, 9)).toBe(270);
    expect(careerMatchmakingScore(0, 10)).toBe(300);
    expect(careerMatchmakingScore(0, 19)).toBe(570);
    expect(careerMatchmakingScore(0, 20)).toBe(600);
    expect(careerMatchmakingScore(0, 30)).toBe(600);
    expect(careerMatchmakingScore(720, 2)).toBe(720);
    expect(careerMatchmakingScore(900, 30)).toBe(900);
    expect(careerMatchmakingScore(0, 3, 4)).toBe(360);
    expect(careerMatchmakingScore(0, 10, 7)).toBe(630);
    expect(careerMatchmakingScore(0, 10, 10)).toBe(900);
    expect(careerMatchmakingScore(Number.NaN, Number.NaN)).toBe(0);
  });

  it("rewards strong league results and punishes poor ones", () => {
    const strong = scoreDeltaForStanding({ points: 11, goalDifference: 5, goalsFor: 9 }, true);
    const poor = scoreDeltaForStanding({ points: 1, goalDifference: -7, goalsFor: 2 }, false);

    expect(strong).toBeGreaterThan(25);
    expect(poor).toBeLessThan(-10);
  });
});
