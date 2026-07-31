import { describe, expect, it } from "vitest";
import {
  nextCareerMilestones,
  nextCareerMilestonesForMode,
  normalizeCareerRecords,
  summarizeCareer
} from "@/lib/game/career";
import type { LeaderboardRecord } from "@/lib/game/types";

function record(
  id: string,
  competitionMode: "minileague" | "invincible",
  overrides: Partial<LeaderboardRecord> = {}
): LeaderboardRecord {
  return {
    id,
    userId: "manager-1",
    displayName: "Manager One",
    kind: "human",
    competitionMode,
    runId: id,
    gamesPlayed: competitionMode === "invincible" ? 38 : 5,
    finalPosition: 2,
    periodAt: "2026-08-01T00:00:00.000Z",
    matchPoints: 8,
    goalDifference: 1,
    goalsFor: 7,
    leagueTitles: 0,
    opponentStrength: 500,
    completedAt: "2026-08-01T00:00:00.000Z",
    ...overrides
  };
}

describe("career summaries", () => {
  it("returns explicit empty-state values", () => {
    expect(summarizeCareer([])).toEqual({
      totalRuns: 0,
      totalTitles: 0,
      miniLeague: { runs: 0, titles: 0, totalPoints: 0, bestPoints: null },
      invincible: { runs: 0, titles: 0, totalPoints: 0, bestPoints: null }
    });
  });

  it("summarizes Mini and Invincible histories independently", () => {
    const summary = summarizeCareer([
      record("mini-1", "minileague", { matchPoints: 9, leagueTitles: 1 }),
      record("mini-2", "minileague", { matchPoints: 12 }),
      record("season-1", "invincible", { matchPoints: 86, leagueTitles: 1 }),
      record("season-2", "invincible", { matchPoints: 74 })
    ]);

    expect(summary).toEqual({
      totalRuns: 4,
      totalTitles: 2,
      miniLeague: { runs: 2, titles: 1, totalPoints: 21, bestPoints: 12 },
      invincible: { runs: 2, titles: 1, totalPoints: 160, bestPoints: 86 }
    });
  });

  it("deduplicates completion retries and ignores non-human board rows", () => {
    const summary = summarizeCareer([
      record("local-copy", "minileague", { runId: "same-run", matchPoints: 5 }),
      record("server-copy", "minileague", { runId: "same-run", matchPoints: 11, leagueTitles: 1 }),
      record("opponent", "minileague", { kind: "reserve", matchPoints: 15, leagueTitles: 1 })
    ]);

    expect(summary.totalRuns).toBe(1);
    expect(summary.miniLeague).toEqual({ runs: 1, titles: 1, totalPoints: 11, bestPoints: 11 });
  });

  it("safely normalizes malformed numeric values and legacy Mini records", () => {
    const malformed = record("legacy", "minileague", {
      competitionMode: undefined as unknown as "minileague",
      matchPoints: Number.NaN,
      leagueTitles: 99
    });
    const negative = record("negative", "invincible", {
      matchPoints: -20,
      leagueTitles: -1
    });

    const summary = summarizeCareer([malformed, negative]);
    expect(summary.totalRuns).toBe(2);
    expect(summary.totalTitles).toBe(1);
    expect(summary.miniLeague).toEqual({ runs: 1, titles: 1, totalPoints: 0, bestPoints: 0 });
    expect(summary.invincible).toEqual({ runs: 1, titles: 0, totalPoints: 0, bestPoints: 0 });
  });

  it("provides one sanitized record set for every career surface", () => {
    const normalized = normalizeCareerRecords([
      record("local-copy", "minileague", {
        runId: "same-run",
        matchPoints: Number.NaN,
        goalDifference: Number.NaN,
        goalsFor: -4,
        leagueTitles: 99,
        completedAt: "not-a-date"
      }),
      record("server-copy", "minileague", {
        runId: "same-run",
        matchPoints: 99,
        gamesPlayed: 99,
        leagueTitles: 12
      })
    ]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toMatchObject({
      id: "server-copy",
      runId: "same-run",
      matchPoints: 15,
      gamesPlayed: 5,
      leagueTitles: 1
    });
    expect(summarizeCareer(normalized)).toMatchObject({
      totalRuns: 1,
      totalTitles: 1,
      miniLeague: { runs: 1, titles: 1, totalPoints: 15, bestPoints: 15 }
    });
  });
});

describe("career milestones", () => {
  it("offers reachable first targets for a new manager", () => {
    const milestones = nextCareerMilestones(summarizeCareer([]));

    expect(milestones.find((item) => item.id === "career_runs")).toMatchObject({
      current: 0,
      target: 1,
      remaining: 1,
      progressPercent: 0
    });
    expect(milestones.find((item) => item.id === "minileague_best_points")?.target).toBe(5);
    expect(milestones.find((item) => item.id === "invincible_best_points")?.target).toBe(40);
  });

  it("rolls exact run and title thresholds forward", () => {
    const records = [
      ...Array.from({ length: 5 }, (_, index) =>
        record(`mini-${index}`, "minileague", { leagueTitles: index < 3 ? 1 : 0 })
      ),
      ...Array.from({ length: 10 }, (_, index) =>
        record(`season-${index}`, "invincible", { matchPoints: 70, leagueTitles: index < 5 ? 1 : 0 })
      )
    ];
    const milestones = nextCareerMilestones(summarizeCareer(records));

    expect(milestones.find((item) => item.id === "career_runs")).toMatchObject({ current: 15, target: 25 });
    expect(milestones.find((item) => item.id === "minileague_runs")).toMatchObject({ current: 5, target: 10 });
    expect(milestones.find((item) => item.id === "minileague_titles")).toMatchObject({ current: 3, target: 5 });
    expect(milestones.find((item) => item.id === "invincible_runs")).toMatchObject({ current: 10, target: 25 });
    expect(milestones.find((item) => item.id === "invincible_titles")).toMatchObject({ current: 5, target: 10 });
  });

  it("keeps veteran run and title tracks open beyond the named tiers", () => {
    const records = Array.from({ length: 126 }, (_, index) =>
      record(`mini-${index}`, "minileague", { leagueTitles: index < 51 ? 1 : 0 })
    );
    const milestones = nextCareerMilestones(summarizeCareer(records));

    expect(milestones.find((item) => item.id === "career_runs")).toMatchObject({ current: 126, target: 150 });
    expect(milestones.find((item) => item.id === "minileague_runs")).toMatchObject({ current: 126, target: 150 });
    expect(milestones.find((item) => item.id === "minileague_titles")).toMatchObject({ current: 51, target: 75 });
  });

  it("does not advertise impossible best-points targets after a perfect result", () => {
    const summary = summarizeCareer([
      record("perfect-mini", "minileague", { matchPoints: 15 }),
      record("perfect-season", "invincible", { matchPoints: 114 })
    ]);
    const milestones = nextCareerMilestones(summary);

    expect(milestones.some((item) => item.id === "minileague_best_points")).toBe(false);
    expect(milestones.some((item) => item.id === "invincible_best_points")).toBe(false);
  });

  it("reports bounded percentage progress and mode-specific selections", () => {
    const summary = summarizeCareer([
      record("mini-1", "minileague", { matchPoints: 9 }),
      record("mini-2", "minileague", { matchPoints: 10 }),
      record("season-1", "invincible", { matchPoints: 75 })
    ]);
    const miniMilestones = nextCareerMilestonesForMode(summary, "minileague");

    expect(miniMilestones.every((item) => item.mode === "all" || item.mode === "minileague")).toBe(true);
    expect(miniMilestones.some((item) => item.mode === "invincible")).toBe(false);
    expect(miniMilestones.find((item) => item.id === "minileague_best_points")).toMatchObject({
      current: 10,
      target: 12,
      remaining: 2,
      progressPercent: 83
    });
    expect(miniMilestones.every((item) => item.progressPercent >= 0 && item.progressPercent <= 100)).toBe(true);
  });
});
