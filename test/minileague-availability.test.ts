import { describe, expect, it } from "vitest";
import { advanceMiniLeagueAvailability } from "@/lib/game/minileague-availability";
import type { FixtureResult, ManagerSquad } from "@/lib/game/types";

function manager(
  id: string,
  availability: Pick<ManagerSquad, "injuredPlayerIds" | "suspendedPlayerIds"> = {
    injuredPlayerIds: [],
    suspendedPlayerIds: []
  }
): ManagerSquad {
  return {
    id,
    displayName: id,
    kind: id === "human" ? "human" : "reserve",
    formationId: "4-3-3",
    mode: "classic",
    picks: [],
    mmr: 1_000,
    managerRating: 50,
    completedLeagues: 0,
    injuredPlayerIds: availability.injuredPlayerIds,
    suspendedPlayerIds: availability.suspendedPlayerIds,
    substitutions: {}
  };
}

function result(overrides: Partial<FixtureResult> = {}): FixtureResult {
  return {
    fixtureId: "fixture-1",
    round: 1,
    homeId: "human",
    awayId: "ai-1",
    homeGoals: 1,
    awayGoals: 0,
    events: [],
    homeInjuries: [],
    awayInjuries: [],
    homeRedCards: [],
    awayRedCards: [],
    playedAt: "2026-08-01T00:00:00.000Z",
    ...overrides
  };
}

describe("Mini League availability", () => {
  it("clears a suspension that was served in the completed round", () => {
    const human = manager("human", { injuredPlayerIds: [], suspendedPlayerIds: [11] });
    const opponent = manager("ai-1");

    const nextManagers = advanceMiniLeagueAvailability([human, opponent], [result()]);

    expect(nextManagers.find((entry) => entry.id === "human")?.suspendedPlayerIds).toEqual([]);
  });

  it("keeps a new red-card suspension for the next fixture and clears it afterward", () => {
    const managers = [
      manager("human", { injuredPlayerIds: [], suspendedPlayerIds: [11] }),
      manager("ai-1")
    ];
    const afterRedCard = advanceMiniLeagueAvailability(managers, [result({ homeRedCards: [12] })]);

    // The old ban was served in this fixture; only the newly earned ban remains.
    expect(afterRedCard.find((entry) => entry.id === "human")?.suspendedPlayerIds).toEqual([12]);

    const afterNextFixture = advanceMiniLeagueAvailability(afterRedCard, [
      result({ fixtureId: "fixture-2", round: 2 })
    ]);

    expect(afterNextFixture.find((entry) => entry.id === "human")?.suspendedPlayerIds).toEqual([]);
  });

  it("persists injuries and applies new human and AI incidents from every round result", () => {
    const managers = [
      manager("human", { injuredPlayerIds: [10], suspendedPlayerIds: [] }),
      manager("ai-1"),
      manager("ai-2"),
      manager("ai-3")
    ];
    const roundResults = [
      result({ homeInjuries: [11], awayRedCards: [21] }),
      result({
        fixtureId: "fixture-2",
        homeId: "ai-2",
        awayId: "ai-3",
        homeRedCards: [31],
        awayInjuries: [41]
      })
    ];

    const nextManagers = advanceMiniLeagueAvailability(managers, roundResults);

    expect(nextManagers.find((entry) => entry.id === "human")?.injuredPlayerIds).toEqual([10, 11]);
    expect(nextManagers.find((entry) => entry.id === "ai-1")?.suspendedPlayerIds).toEqual([21]);
    expect(nextManagers.find((entry) => entry.id === "ai-2")?.suspendedPlayerIds).toEqual([31]);
    expect(nextManagers.find((entry) => entry.id === "ai-3")?.injuredPlayerIds).toEqual([41]);
  });

  it("leaves managers with no prior suspension or new incident unchanged", () => {
    const human = manager("human");
    const opponent = manager("ai-1");

    const nextManagers = advanceMiniLeagueAvailability([human, opponent], [result()]);

    expect(nextManagers[0]).toBe(human);
    expect(nextManagers[1]).toBe(opponent);
  });
});
