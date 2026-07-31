import { describe, expect, it } from "vitest";
import {
  achievementEntitlementGrants,
  achievementProgress,
  achievementTotals
} from "@/lib/game/achievements";
import type { LeaderboardRecord } from "@/lib/game/types";

function record(
  id: string,
  overrides: Partial<LeaderboardRecord> = {}
): LeaderboardRecord {
  return {
    id,
    userId: "manager-1",
    displayName: "@manager_1",
    kind: "human",
    competitionMode: "minileague",
    runId: id,
    gamesPlayed: 5,
    finalPosition: 2,
    periodAt: "2026-08-01T00:00:00.000Z",
    matchPoints: 8,
    goalDifference: 1,
    goalsFor: 4,
    leagueTitles: 0,
    opponentStrength: 500,
    completedAt: "2026-08-01T00:00:00.000Z",
    ...overrides
  };
}

describe("personalization achievements", () => {
  it("shows bounded progress for a new manager", () => {
    const progress = achievementProgress([]);
    expect(progress.map(({ id, current, completed, progressPercent }) => ({ id, current, completed, progressPercent }))).toEqual([
      { id: "first_campaign", current: 0, completed: false, progressPercent: 0 },
      { id: "goal_getter", current: 0, completed: false, progressPercent: 0 },
      { id: "club_established", current: 0, completed: false, progressPercent: 0 }
    ]);
  });

  it("unlocks a custom name after either competition mode completes", () => {
    const records = [record("season-1", { competitionMode: "invincible", gamesPlayed: 38, goalsFor: 6 })];
    expect(achievementProgress(records).find(({ id }) => id === "first_campaign")).toMatchObject({
      current: 1,
      remaining: 0,
      progressPercent: 100,
      completed: true,
      reward: "club_name_custom"
    });
    expect(achievementEntitlementGrants(records)).toContainEqual({
      entitlement: "club_name_custom",
      source: "achievement",
      sourceRef: "first_campaign"
    });
  });

  it("unlocks palettes at ten career goals and patterns after three runs", () => {
    const records = [
      record("mini-1", { goalsFor: 4 }),
      record("mini-2", { goalsFor: 3 }),
      record("season-1", { competitionMode: "invincible", gamesPlayed: 38, goalsFor: 5 })
    ];
    expect(achievementTotals(records)).toEqual({ completedRuns: 3, careerGoals: 12 });
    expect(achievementEntitlementGrants(records).map((grant) => grant.entitlement)).toEqual([
      "club_name_custom",
      "kit_palette_basic",
      "kit_style_basic"
    ]);
  });

  it("deduplicates completion retries and ignores reserve records", () => {
    const records = [
      record("local", { runId: "same-run", goalsFor: 99 }),
      record("server", { runId: "same-run", goalsFor: 5 }),
      record("reserve", { kind: "reserve", goalsFor: 50 })
    ];
    expect(achievementTotals(records)).toEqual({ completedRuns: 1, careerGoals: 5 });
    expect(achievementProgress(records).find(({ id }) => id === "goal_getter")).toMatchObject({
      current: 5,
      remaining: 5,
      progressPercent: 50,
      completed: false
    });
  });

  it("sanitizes malformed and impossible goal totals through career normalization", () => {
    const records = [
      record("nan", { goalsFor: Number.NaN }),
      record("negative", { goalsFor: -12 }),
      record("huge-mini", { goalsFor: 999 })
    ];
    expect(achievementTotals(records)).toEqual({ completedRuns: 3, careerGoals: 100 });
    expect(achievementProgress(records).every((item) => item.progressPercent <= 100)).toBe(true);
  });
});
