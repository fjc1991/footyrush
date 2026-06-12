import { beforeAll, describe, expect, it } from "vitest";
import rawData from "../data.json";
import { effectiveRating, seedFootballData } from "@/lib/game/data";
import { autoDraftManager } from "@/lib/game/draft";
import { getStarterSlots } from "@/lib/game/formations";
import type { RawFootballData } from "@/lib/game/types";
import { buildRoundRobin } from "@/lib/game/matchmaking";
import { applyFixtureInjuries, calculateSquadStrength, computeStandings, simulateFixture } from "@/lib/game/simulation";

describe("match simulation", () => {
  beforeAll(() => {
    seedFootballData(rawData as unknown as RawFootballData);
  });

  function makeManagers() {
    const home = autoDraftManager({ id: "home", displayName: "Home", formationId: "4-3-3", seed: "home" });
    const away = autoDraftManager({ id: "away", displayName: "Away", formationId: "4-4-2", seed: "away" });
    const fixture = { id: "fixture-1", round: 1, homeId: "home", awayId: "away" };
    return { home, away, fixture };
  }

  it("is deterministic for the same seed", () => {
    const { home, away, fixture } = makeManagers();
    const first = simulateFixture({ fixture, home, away, seed: "fixed" });
    const second = simulateFixture({ fixture, home, away, seed: "fixed" });

    expect(first.homeGoals).toBe(second.homeGoals);
    expect(first.awayGoals).toBe(second.awayGoals);
    expect(first.events.map((e) => e.code)).toEqual(second.events.map((e) => e.code));
  });

  it("keeps standings with standard 3-1-0 scoring", () => {
    const { home, away, fixture } = makeManagers();
    const result = { ...simulateFixture({ fixture, home, away, seed: "table" }), homeGoals: 2, awayGoals: 1 };
    const standings = computeStandings([home, away], [result]);
    expect(standings[0].managerId).toBe("home");
    expect(standings[0].points).toBe(3);
    expect(standings[1].points).toBe(0);
  });

  it("persists injuries onto manager state", () => {
    const { home, away, fixture } = makeManagers();
    const result = simulateFixture({ fixture, home, away, seed: "injury-candidate" });
    const updated = applyFixtureInjuries([home, away], {
      ...result,
      homeInjuries: [home.picks[0].player.i],
      awayInjuries: []
    });

    expect(updated.find((m) => m.id === "home")?.injuredPlayerIds).toContain(home.picks[0].player.i);
  });

  it("never fields a user-chosen substitute who is also injured", () => {
    const { home, away, fixture } = makeManagers();
    const starter = home.picks[1];
    const sub = home.picks.find((pick) => pick.target === "SUB")!;
    const woundedHome = {
      ...home,
      injuredPlayerIds: [starter.player.i, sub.player.i],
      substitutions: { [starter.player.i]: sub.player.i }
    };

    for (let i = 0; i < 200; i += 1) {
      const result = simulateFixture({ fixture, home: woundedHome, away, seed: `sub-check-${i}` });
      const onPitchEvents = result.events.filter(
        (e) => e.teamId === "home" && ["goal", "chance", "save", "near_miss"].includes(e.code)
      );
      expect(onPitchEvents.some((e) => e.playerId === sub.player.i)).toBe(false);
    }
  });

  it("counts replacement ratings in the injured starter's tactical line", () => {
    const { home } = makeManagers();
    const attackSlot = getStarterSlots(home.formationId).find((slot) => slot.line === "attack")!;
    const starter = home.picks.find((pick) => pick.slotId === attackSlot.id)!;
    const sub = home.picks.find((pick) => pick.target === "SUB")!;
    const woundedHome = {
      ...home,
      injuredPlayerIds: [starter.player.i],
      substitutions: { [starter.player.i]: sub.player.i }
    };

    const strength = calculateSquadStrength(woundedHome);
    const expectedAttack = getStarterSlots(home.formationId)
      .filter((slot) => slot.line === "attack")
      .reduce((sum, slot) => {
        const pick = home.picks.find((candidate) => candidate.slotId === slot.id)!;
        return sum + (pick.player.i === starter.player.i ? effectiveRating(sub.player, slot.target) - 2 : pick.effectiveRating);
      }, 0) / getStarterSlots(home.formationId).filter((slot) => slot.line === "attack").length;

    expect(strength.attack).toBeCloseTo(expectedAttack, 5);
  });

  it("can interleave away goals before home goals in mixed scorelines", () => {
    const { home, away, fixture } = makeManagers();
    let foundAwayBeforeHome = false;

    for (let i = 0; i < 600; i += 1) {
      const result = simulateFixture({ fixture, home, away, seed: `interleave-${i}` });
      if (result.homeGoals === 0 || result.awayGoals === 0) continue;
      const homeGoalSeconds = result.events.filter((e) => e.code === "goal" && e.teamId === "home").map((e) => e.second);
      const awayGoalSeconds = result.events.filter((e) => e.code === "goal" && e.teamId === "away").map((e) => e.second);
      if (Math.min(...awayGoalSeconds) < Math.max(...homeGoalSeconds)) {
        foundAwayBeforeHome = true;
        break;
      }
    }

    expect(foundAwayBeforeHome).toBe(true);
  });

  it("creates five rounds for six managers", () => {
    const managers = Array.from({ length: 6 }, (_, index) =>
      autoDraftManager({ id: `m-${index}`, displayName: `M ${index}`, formationId: "4-3-3", seed: `m-${index}` })
    );
    const rounds = buildRoundRobin(managers);
    expect(rounds).toHaveLength(5);
    expect(rounds.every((round) => round.length === 3)).toBe(true);
  });
});
