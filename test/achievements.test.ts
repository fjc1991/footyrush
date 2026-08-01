import { describe, expect, it } from "vitest";
import {
  UNLOCK_CATALOG,
  unlockEntitlementGrants,
  unlockProgress,
  unlockTotals
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
    matchPoints: 0,
    goalDifference: 0,
    goalsFor: 0,
    leagueTitles: 0,
    opponentStrength: 500,
    completedAt: "2026-08-01T00:00:00.000Z",
    ...overrides
  };
}

function records(count: number, prefix: string, overrides: Partial<LeaderboardRecord> = {}) {
  return Array.from({ length: count }, (_, index) => record(`${prefix}-${index}`, overrides));
}

describe("personalization unlocks", () => {
  it("uses four hard paths with distinct metrics and rewards", () => {
    expect(UNLOCK_CATALOG.map(({ id, metric, target, reward }) => ({ id, metric, target, reward }))).toEqual([
      { id: "club_identity", metric: "completed_runs", target: 50, reward: "club_name_custom" },
      { id: "club_colours", metric: "career_goals", target: 500, reward: "kit_palette_basic" },
      { id: "kit_designer", metric: "career_points", target: 2_500, reward: "kit_style_basic" },
      { id: "badge_heritage", metric: "league_titles", target: 100, reward: "badge_style_basic" }
    ]);
    expect(new Set(UNLOCK_CATALOG.map((unlock) => unlock.metric)).size).toBe(4);
    expect(new Set(UNLOCK_CATALOG.map((unlock) => unlock.reward)).size).toBe(4);
  });

  it("shows bounded zero progress for a new manager", () => {
    expect(unlockProgress([]).map(({ id, current, completed, progressPercent }) => ({ id, current, completed, progressPercent }))).toEqual([
      { id: "club_identity", current: 0, completed: false, progressPercent: 0 },
      { id: "club_colours", current: 0, completed: false, progressPercent: 0 },
      { id: "kit_designer", current: 0, completed: false, progressPercent: 0 },
      { id: "badge_heritage", current: 0, completed: false, progressPercent: 0 }
    ]);
  });

  it("does not unlock the customizer after only three ordinary campaigns", () => {
    const early = records(3, "early", { goalsFor: 5, matchPoints: 9, leagueTitles: 1 });
    expect(unlockTotals(early)).toEqual({
      completedRuns: 3,
      careerGoals: 15,
      careerPoints: 27,
      leagueTitles: 3
    });
    expect(unlockEntitlementGrants(early)).toEqual([]);
  });

  it("unlocks the club name at exactly fifty completed campaigns", () => {
    const before = unlockProgress(records(49, "run")).find(({ id }) => id === "club_identity");
    const atTarget = unlockProgress(records(50, "run")).find(({ id }) => id === "club_identity");
    expect(before).toMatchObject({ current: 49, remaining: 1, completed: false, progressPercent: 98 });
    expect(atTarget).toMatchObject({ current: 50, remaining: 0, completed: true, progressPercent: 100 });
  });

  it("keeps 499 of 500 goals visibly incomplete and grants only colours at 500", () => {
    const goal499 = [100, 100, 100, 100, 99].map((goals, index) => record(`goal-${index}`, { goalsFor: goals }));
    const goal500 = goal499.map((item, index) => index === 4 ? { ...item, goalsFor: 100 } : item);
    expect(unlockProgress(goal499).find(({ id }) => id === "club_colours")).toMatchObject({
      current: 499,
      remaining: 1,
      completed: false,
      progressPercent: 99.8
    });
    expect(unlockEntitlementGrants(goal500)).toEqual([
      { entitlement: "kit_palette_basic", source: "unlock", sourceRef: "club_colours" }
    ]);
  });

  it("tracks career points independently from campaigns and goals", () => {
    const pointRecords = [
      ...records(21, "points-full", { competitionMode: "invincible", gamesPlayed: 38, matchPoints: 114 }),
      record("points-last", { competitionMode: "invincible", gamesPlayed: 38, matchPoints: 106 })
    ];
    expect(unlockTotals(pointRecords)).toMatchObject({ completedRuns: 22, careerGoals: 0, careerPoints: 2_500 });
    expect(unlockEntitlementGrants(pointRecords)).toEqual([
      { entitlement: "kit_style_basic", source: "unlock", sourceRef: "kit_designer" }
    ]);
  });

  it("requires one hundred league titles for badge shapes", () => {
    const title99 = records(99, "title", { leagueTitles: 1 });
    const title100 = records(100, "title", { leagueTitles: 1 });
    expect(unlockProgress(title99).find(({ id }) => id === "badge_heritage")).toMatchObject({
      current: 99,
      remaining: 1,
      completed: false,
      progressPercent: 99
    });
    expect(unlockEntitlementGrants(title100).map((grant) => grant.entitlement)).toEqual([
      "club_name_custom",
      "badge_style_basic"
    ]);
  });

  it("never grants the Supporter Edition through gameplay", () => {
    const decoratedCareer = records(100, "decorated", {
      competitionMode: "invincible",
      gamesPlayed: 38,
      goalsFor: 300,
      matchPoints: 114,
      leagueTitles: 1
    });
    expect(unlockEntitlementGrants(decoratedCareer).map((grant) => grant.entitlement)).toEqual([
      "club_name_custom",
      "kit_palette_basic",
      "kit_style_basic",
      "badge_style_basic"
    ]);
    expect(unlockEntitlementGrants(decoratedCareer)).not.toContainEqual(
      expect.objectContaining({ entitlement: "supporter_edition" })
    );
  });

  it("deduplicates completion retries and ignores reserve records", () => {
    const attempts = [
      record("local", { runId: "same-run", goalsFor: 99, matchPoints: 15, leagueTitles: 1 }),
      record("server", { runId: "same-run", goalsFor: 5, matchPoints: 6, leagueTitles: 0 }),
      record("reserve", { kind: "reserve", goalsFor: 50, matchPoints: 15, leagueTitles: 1 })
    ];
    expect(unlockTotals(attempts)).toEqual({
      completedRuns: 1,
      careerGoals: 5,
      careerPoints: 6,
      leagueTitles: 0
    });
  });

  it("sanitizes malformed and impossible per-run totals", () => {
    const malformed = [
      record("nan", { goalsFor: Number.NaN, matchPoints: Number.NaN, leagueTitles: Number.NaN }),
      record("negative", { goalsFor: -12, matchPoints: -3, leagueTitles: -1 }),
      record("huge-mini", { goalsFor: 999, matchPoints: 999, leagueTitles: 999 })
    ];
    expect(unlockTotals(malformed)).toEqual({
      completedRuns: 3,
      careerGoals: 100,
      careerPoints: 15,
      leagueTitles: 1
    });
    expect(unlockProgress(malformed).every((item) => item.progressPercent < 100 || item.completed)).toBe(true);
  });
});
