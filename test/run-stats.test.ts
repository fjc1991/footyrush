import { describe, expect, it } from "vitest";
import {
  aggregateRunStats,
  nextPlayerGoalTarget
} from "@/lib/game/run-stats";
import type { FixtureResult, MatchEvent, MatchEventCode } from "@/lib/game/types";

function event(
  id: string,
  code: MatchEventCode,
  teamId?: string,
  playerId?: number,
  playerName?: string,
  params: MatchEvent["params"] = {}
): MatchEvent {
  return { id, second: 60, code, teamId, playerId, playerName, params };
}

function result(
  id: string,
  homeId: string,
  awayId: string,
  homeGoals: number,
  awayGoals: number,
  events: MatchEvent[]
): FixtureResult {
  return {
    fixtureId: id,
    round: 1,
    homeId,
    awayId,
    homeGoals,
    awayGoals,
    events,
    homeInjuries: [],
    awayInjuries: [],
    homeRedCards: [],
    awayRedCards: [],
    playedAt: "2026-08-01T00:00:00.000Z"
  };
}

describe("run stats", () => {
  it("returns a complete empty state", () => {
    expect(aggregateRunStats({ mode: "minileague", results: [] })).toEqual({
      mode: "minileague",
      matches: 0,
      goalsScored: 0,
      cleanSheets: 0,
      uniqueScorers: 0,
      injuries: 0,
      redCards: 0,
      impactSubUses: 0,
      scorers: [],
      topScorer: null,
      nextPlayerGoalMilestone: null
    });
  });

  it("aggregates only the human side across home and away fixtures", () => {
    const stats = aggregateRunStats({
      mode: "minileague",
      results: [
        result("one", "human", "opponent-a", 2, 0, [
          event("goal-a", "goal", "human", 10, "Ada Striker"),
          event("goal-b", "goal", "human", 20, "Bea Forward"),
          event("injury", "injury", "human", 10, "Ada Striker"),
          event("impact", "substitution", "human", 30, "Cia Sub", { impactSub: 1 }),
          event("opponent-red", "red_card", "opponent-a", 99, "Opponent")
        ]),
        result("two", "opponent-b", "human", 1, 2, [
          event("goal-c", "goal", "human", 10, "Ada Striker"),
          event("opponent-goal", "goal", "opponent-b", 98, "Opponent"),
          event("human-red", "red_card", "human", 20, "Bea Forward"),
          event("opponent-injury", "injury", "opponent-b", 98, "Opponent")
        ]),
        result("unrelated", "opponent-c", "opponent-d", 4, 3, [
          event("not-human", "goal", "human", 10, "Ada Striker")
        ])
      ]
    });

    expect(stats).toMatchObject({
      matches: 2,
      goalsScored: 3,
      cleanSheets: 1,
      uniqueScorers: 2,
      injuries: 1,
      redCards: 1,
      impactSubUses: 1
    });
    expect(stats.scorers).toEqual([
      { playerId: 10, playerName: "Ada Striker", goals: 2, nextGoalTarget: 3 },
      { playerId: 20, playerName: "Bea Forward", goals: 1, nextGoalTarget: 3 }
    ]);
    expect(stats.topScorer).toEqual(stats.scorers[0]);
    expect(stats.nextPlayerGoalMilestone).toEqual({
      playerId: 10,
      playerName: "Ada Striker",
      currentGoals: 2,
      targetGoals: 3,
      goalsRemaining: 1
    });
  });

  it("counts human goal events even when scorer identity is malformed", () => {
    const malformedEvents = [
      event("id-only", "goal", "human", 7),
      event("valid", "goal", "human", 7, "  Alex   Ace  "),
      event("anonymous", "goal", "human"),
      event("name-only", "goal", "human", undefined, "Mystery Player"),
      event("wrong-team", "goal", "opponent", 7, "Alex Ace"),
      event("missing-team", "goal", undefined, 7, "Alex Ace"),
      null,
      "not-an-event"
    ] as unknown as MatchEvent[];
    const stats = aggregateRunStats({
      mode: "minileague",
      results: [result("malformed", "human", "opponent", 3, 0, malformedEvents)]
    });

    expect(stats.goalsScored).toBe(4);
    expect(stats.uniqueScorers).toBe(2);
    expect(stats.scorers.map((scorer) => scorer.playerName)).toEqual(["Alex Ace", "Mystery Player"]);
    expect(stats.topScorer).toMatchObject({ playerName: "Alex Ace", goals: 2 });
  });

  it("preserves colliding goal ids while deduplicating fixtures and non-goal events", () => {
    const first = result("same-fixture", "human", "opponent", 2, 0, [
      event("same-goal", "goal", "human", 1, "Scorer"),
      event("same-goal", "goal", "human", 1, "Scorer"),
      event("impact", "substitution", "human", 2, "Sub", { impactSub: "1" }),
      event("impact", "substitution", "human", 2, "Sub", { impactSub: "1" })
    ]);
    const stats = aggregateRunStats({ mode: "minileague", results: [first, first] });

    expect(stats).toMatchObject({ matches: 1, goalsScored: 2, cleanSheets: 1, impactSubUses: 1 });
    expect(stats.scorers[0]?.goals).toBe(2);
  });

  it("merges a name-only goal into its one unambiguous identified scorer", () => {
    const nameOnly = event("name-only", "goal", "human", undefined, "Alex Ace");
    const identified = event("identified", "goal", "human", 42, "  Alex   Ace ");
    const forward = aggregateRunStats({
      mode: "minileague",
      results: [result("forward-identity", "human", "opponent", 2, 0, [nameOnly, identified])]
    });
    const reverse = aggregateRunStats({
      mode: "minileague",
      results: [result("reverse-identity", "human", "opponent", 2, 0, [identified, nameOnly])]
    });

    expect(forward.uniqueScorers).toBe(1);
    expect(forward.scorers).toEqual([
      { playerId: 42, playerName: "Alex Ace", goals: 2, nextGoalTarget: 3 }
    ]);
    expect(reverse.scorers).toEqual(forward.scorers);
  });

  it("does not guess when a name-only goal matches multiple identified players", () => {
    const stats = aggregateRunStats({
      mode: "minileague",
      results: [result("ambiguous-identity", "human", "opponent", 3, 0, [
        event("first", "goal", "human", 1, "Same Name"),
        event("second", "goal", "human", 2, "Same Name"),
        event("unknown", "goal", "human", undefined, "Same Name")
      ])]
    });

    expect(stats.uniqueScorers).toBe(3);
    expect(stats.scorers.map((scorer) => scorer.playerId)).toEqual([1, 2, null]);
  });

  it("falls back to opponent goal events when a cached scoreline is malformed", () => {
    const cached = result("cached", "human", "opponent", 1, 0, [
      event("human-goal", "goal", "human", 1, "Scorer"),
      event("opponent-goal", "goal", "opponent", 2, "Opponent")
    ]);
    cached.awayGoals = Number.NaN;

    expect(aggregateRunStats({ mode: "minileague", results: [cached] }).cleanSheets).toBe(0);
  });

  it("sorts tied scorers deterministically by normalized name then player id", () => {
    const events = [
      event("z", "goal", "human", 4, "zoe"),
      event("b", "goal", "human", 3, "Alex"),
      event("a", "goal", "human", 2, "alex"),
      event("casey-high", "goal", "human", 6, "Casey"),
      event("casey-low", "goal", "human", 5, "Casey")
    ];
    const forward = aggregateRunStats({
      mode: "minileague",
      results: [result("forward", "human", "opponent", 5, 0, events)]
    });
    const reverse = aggregateRunStats({
      mode: "minileague",
      results: [result("reverse", "human", "opponent", 5, 0, [...events].reverse())]
    });

    expect(forward.scorers.map((scorer) => [scorer.playerName, scorer.playerId])).toEqual([
      ["Alex", 3],
      ["alex", 2],
      ["Casey", 5],
      ["Casey", 6],
      ["zoe", 4]
    ]);
    expect(reverse.scorers).toEqual(forward.scorers);
  });

  it("selects the nearest remaining scorer milestone when the top scorer has finished the ladder", () => {
    const events = [
      ...Array.from({ length: 8 }, (_, index) => event(`top-${index}`, "goal", "human", 1, "Top Scorer")),
      ...Array.from({ length: 2 }, (_, index) => event(`next-${index}`, "goal", "human", 2, "Next Scorer"))
    ];
    const stats = aggregateRunStats({
      mode: "minileague",
      results: [result("ladder", "human", "opponent", 10, 0, events)]
    });

    expect(stats.topScorer).toMatchObject({ playerName: "Top Scorer", goals: 8, nextGoalTarget: null });
    expect(stats.nextPlayerGoalMilestone).toMatchObject({
      playerName: "Next Scorer",
      currentGoals: 2,
      targetGoals: 3,
      goalsRemaining: 1
    });
  });
});

describe("player goal milestone tiers", () => {
  it("rolls Mini League milestones forward and stops at eight", () => {
    expect([0, 1, 2, 3, 5, 8].map((goals) => nextPlayerGoalTarget("minileague", goals)))
      .toEqual([1, 3, 3, 5, 8, null]);
  });

  it("rolls Invincible milestones forward and stops at thirty", () => {
    expect([0, 5, 9, 10, 20, 30].map((goals) => nextPlayerGoalTarget("invincible", goals)))
      .toEqual([5, 10, 10, 20, 30, null]);
  });

  it("sanitizes invalid current totals", () => {
    expect(nextPlayerGoalTarget("minileague", Number.NaN)).toBe(1);
    expect(nextPlayerGoalTarget("invincible", -4)).toBe(5);
  });
});
