import { beforeAll, describe, expect, it } from "vitest";
import rawData from "../data.json";
import { seedFootballData } from "@/lib/game/data";
import { autoDraftManager } from "@/lib/game/draft";
import { getStarterSlots } from "@/lib/game/formations";
import {
  IMPACT_SUB_EXPECTED_GOALS_SWING,
  IMPACT_SUB_MINUTE_END,
  IMPACT_SUB_MINUTE_START,
  INVINCIBLE_IMPACT_SUB_LIMIT,
  MINILEAGUE_IMPACT_SUB_LIMIT,
  availableImpactSubs,
  createImpactSubPlan,
  impactSubEffectForPick,
  remainingImpactSubs
} from "@/lib/game/impact-sub";
import { simulateFixture } from "@/lib/game/simulation";
import type { RawFootballData } from "@/lib/game/types";

describe("impact substitute", () => {
  beforeAll(() => {
    seedFootballData(rawData as unknown as RawFootballData);
  });

  function managers() {
    const home = autoDraftManager({
      id: "home",
      displayName: "Home",
      formationId: "4-3-3",
      seed: "impact-home"
    });
    const away = autoDraftManager({
      id: "away",
      displayName: "Away",
      formationId: "4-4-2",
      seed: "impact-away"
    });
    return {
      home,
      away,
      fixture: { id: "impact-fixture", round: 1, homeId: "home", awayId: "away" }
    };
  }

  it("offers only healthy outfield substitutes who are not already on the pitch", () => {
    const { home } = managers();
    const starter = home.picks.find((pick) => pick.target !== "SUB")!;
    const activeReplacement = home.picks.find((pick) => pick.benchRole === "MID")!;
    const injuredBenchPlayer = home.picks.find((pick) => pick.benchRole === "ATT")!;
    const changed = {
      ...home,
      injuredPlayerIds: [starter.player.i, injuredBenchPlayer.player.i],
      substitutions: { [starter.player.i]: activeReplacement.player.i }
    };

    const options = availableImpactSubs(changed);

    expect(options.every((pick) => pick.target === "SUB" && pick.benchRole !== "GK")).toBe(true);
    expect(options.map((pick) => pick.player.i)).not.toContain(activeReplacement.player.i);
    expect(options.map((pick) => pick.player.i)).not.toContain(injuredBenchPlayer.player.i);
  });

  it("does not offer the automatic replacement when no manual injury choice was saved", () => {
    const { home } = managers();
    const starter = home.picks.find(
      (pick) => pick.target !== "SUB" && !pick.player.p.includes("GK")
    )!;
    const healthyOptions = availableImpactSubs(home);
    const woundedOptions = availableImpactSubs({
      ...home,
      injuredPlayerIds: [starter.player.i],
      substitutions: {}
    });

    expect(woundedOptions.length).toBe(healthyOptions.length - 1);
  });

  it("turns each bench line into an equal-sized but tactically distinct effect", () => {
    const { home } = managers();
    const picks = availableImpactSubs(home);
    const effects = picks
      .map(impactSubEffectForPick)
      .filter((effect): effect is NonNullable<typeof effect> => effect !== null);

    expect(new Set(effects.map((effect) => effect.role))).toEqual(
      new Set(["attack", "control", "protect"])
    );
    effects.forEach((effect) => {
      expect(
        effect.ownExpectedGoalsModifier +
          Math.abs(effect.opponentExpectedGoalsModifier)
      ).toBeCloseTo(IMPACT_SUB_EXPECTED_GOALS_SWING, 8);
    });
  });

  it("builds a deterministic second-half plan in the selected player's tactical line", () => {
    const { home } = managers();
    const selected = availableImpactSubs(home).find((pick) => pick.benchRole === "ATT")!;
    const first = createImpactSubPlan({ manager: home, playerId: selected.player.i, seed: "plan" });
    const second = createImpactSubPlan({ manager: home, playerId: selected.player.i, seed: "plan" });

    expect(first).toEqual(second);
    expect(first?.minute).toBeGreaterThanOrEqual(IMPACT_SUB_MINUTE_START);
    expect(first?.minute).toBeLessThanOrEqual(IMPACT_SUB_MINUTE_END);
    expect(first?.targetLine).toBe("attack");
    expect(
      getStarterSlots(home.formationId).find(
        (slot) => home.picks.find((pick) => pick.slotId === slot.id)?.player.i === first?.offPlayerId
      )?.line
    ).toBe("attack");
  });

  it("rejects goalkeepers, unavailable players and unknown ids", () => {
    const { home } = managers();
    const goalkeeper = home.picks.find((pick) => pick.benchRole === "GK")!;
    const attacker = home.picks.find((pick) => pick.benchRole === "ATT")!;

    expect(createImpactSubPlan({ manager: home, playerId: goalkeeper.player.i, seed: "gk" })).toBeNull();
    expect(
      createImpactSubPlan({
        manager: { ...home, suspendedPlayerIds: [attacker.player.i] },
        playerId: attacker.player.i,
        seed: "suspended"
      })
    ).toBeNull();
    expect(createImpactSubPlan({ manager: home, playerId: 987_654_321, seed: "missing" })).toBeNull();
  });

  it("adds one real substitution beat and keeps the selected player on the bench beforehand", () => {
    const { home, away, fixture } = managers();
    const selected = availableImpactSubs(home).find((pick) => pick.benchRole === "ATT")!;
    const result = simulateFixture({
      fixture,
      home,
      away,
      seed: "visible-impact",
      homeImpactSubPlayerId: selected.player.i,
      homeCasualty: null,
      awayCasualty: null
    });
    const impactEvent = result.events.find(
      (event) => event.teamId === home.id && event.params.impactSub === 1
    );

    expect(impactEvent).toMatchObject({
      code: "substitution",
      playerId: selected.player.i,
      teamId: home.id
    });
    expect(impactEvent?.params.off).toBeTypeOf("string");
    expect(impactEvent?.params.impactRole).toBe("attack");
    expect(impactEvent?.second).toBeGreaterThanOrEqual(IMPACT_SUB_MINUTE_START);
    expect(impactEvent?.second).toBeLessThanOrEqual(IMPACT_SUB_MINUTE_END);
    expect(
      result.events.some(
        (event) =>
          event.playerId === selected.player.i &&
          event.second < (impactEvent?.second ?? 0) &&
          ["goal", "chance", "save", "near_miss"].includes(event.code)
      )
    ).toBe(false);
    expect(
      result.events.filter(
        (event) => event.code === "substitution" && event.playerId === selected.player.i
      )
    ).toHaveLength(1);
  });

  it("keeps a forced casualty believable when it lands after the tactical change", () => {
    const { home, away, fixture } = managers();
    const selected = availableImpactSubs(home).find((pick) => pick.benchRole === "ATT")!;
    let foundLaterCasualty = false;

    for (let index = 0; index < 120; index += 1) {
      const seed = `impact-casualty-${index}`;
      const plan = createImpactSubPlan({ manager: home, playerId: selected.player.i, seed })!;
      const result = simulateFixture({
        fixture,
        home,
        away,
        seed,
        homeImpactSubPlayerId: selected.player.i,
        homeCasualty: {
          kind: "injury",
          weightByPlayerId: Object.fromEntries(
            home.picks.map((pick) => [pick.player.i, pick.player.i === plan.offPlayerId ? 1 : 0])
          )
        },
        awayCasualty: null
      });
      const impactEvent = result.events.find((event) => event.params.impactSub === 1)!;
      const injury = result.events.find(
        (event) => event.teamId === home.id && event.code === "injury"
      )!;
      if (injury.second <= impactEvent.second) continue;

      foundLaterCasualty = true;
      expect(injury.playerId).toBe(selected.player.i);
      expect(result.events.indexOf(impactEvent)).toBeLessThan(result.events.indexOf(injury));
      break;
    }

    expect(foundLaterCasualty).toBe(true);
  });

  it("reserves the primed player when another substitute can cover an early injury", () => {
    const { home, away, fixture } = managers();
    const selected = availableImpactSubs(home).find((pick) => pick.benchRole === "ATT")!;
    const injuredStarter = home.picks.find((pick) => pick.player.i === 257_534)!;
    const seed = "early-injury-257534-2";
    const plan = createImpactSubPlan({ manager: home, playerId: selected.player.i, seed })!;
    const result = simulateFixture({
      fixture,
      home,
      away,
      seed,
      homeImpactSubPlayerId: selected.player.i,
      homeCasualty: {
        kind: "injury",
        weightByPlayerId: Object.fromEntries(
          home.picks.map((pick) => [
            pick.player.i,
            pick.player.i === injuredStarter.player.i ? 1 : 0
          ])
        )
      },
      awayCasualty: null
    });
    const injury = result.events.find(
      (event) => event.code === "injury" && event.teamId === home.id
    )!;
    const ordinaryReplacement = result.events.find(
      (event) =>
        event.code === "substitution" &&
        event.teamId === home.id &&
        event.second === injury.second + 1
    )!;
    const impactEvent = result.events.find((event) => event.params.impactSub === 1)!;

    expect(injury.second).toBeLessThan(plan.minute);
    expect(ordinaryReplacement.playerId).not.toBe(selected.player.i);
    expect(impactEvent).toMatchObject({
      playerId: selected.player.i,
      second: plan.minute
    });
    expect(
      result.events.filter(
        (event) => event.code === "substitution" && event.playerId === selected.player.i
      )
    ).toHaveLength(1);
  });

  it("uses an unavoidable early injury entry as the real Impact activation", () => {
    const { home, away, fixture } = managers();
    const selected = availableImpactSubs(home).find((pick) => pick.benchRole === "ATT")!;
    const depletedHome = {
      ...home,
      injuredPlayerIds: home.picks
        .filter(
          (pick) =>
            pick.target === "SUB" && pick.player.i !== selected.player.i
        )
        .map((pick) => pick.player.i)
    };
    const injuredStarter = depletedHome.picks.find(
      (pick) => pick.player.i === 257_534
    )!;
    let foundEarlyEffect = false;

    for (let index = 0; index < 600; index += 1) {
      const seed = `impact-unavoidable-entry-${index}`;
      const plan = createImpactSubPlan({
        manager: depletedHome,
        playerId: selected.player.i,
        seed
      })!;
      const casualty = {
        kind: "injury" as const,
        weightByPlayerId: Object.fromEntries(
          depletedHome.picks.map((pick) => [
            pick.player.i,
            pick.player.i === injuredStarter.player.i ? 1 : 0
          ])
        )
      };
      const base = simulateFixture({
        fixture,
        home: depletedHome,
        away,
        seed,
        homeCasualty: casualty,
        awayCasualty: null
      });
      const impact = simulateFixture({
        fixture,
        home: depletedHome,
        away,
        seed,
        homeImpactSubPlayerId: selected.player.i,
        homeCasualty: casualty,
        awayCasualty: null
      });
      const injury = impact.events.find(
        (event) => event.code === "injury" && event.teamId === home.id
      )!;
      const impactEvent = impact.events.find((event) => event.params.impactSub === 1)!;
      if (impactEvent.second >= plan.minute) continue;

      expect(impactEvent).toMatchObject({
        code: "substitution",
        playerId: selected.player.i,
        second: injury.second + 1
      });
      expect(
        impact.events.filter(
          (event) => event.code === "substitution" && event.playerId === selected.player.i
        )
      ).toHaveLength(1);

      const earlyGoals = (result: typeof base) =>
        result.events.filter(
          (event) =>
            event.code === "goal" &&
            event.teamId === home.id &&
            event.second > impactEvent.second &&
            event.second <= plan.minute
        ).length;
      if (earlyGoals(impact) <= earlyGoals(base)) continue;

      expect(
        impact.events
          .filter(
            (event) => event.code === "goal" && event.second <= impactEvent.second
          )
          .map((event) => [event.second, event.teamId, event.playerId])
      ).toEqual(
        base.events
          .filter(
            (event) => event.code === "goal" && event.second <= impactEvent.second
          )
          .map((event) => [event.second, event.teamId, event.playerId])
      );
      foundEarlyEffect = true;
      break;
    }

    expect(foundEarlyEffect).toBe(true);
  });

  it("does not introduce the primed player twice when an injury lands at the planned minute", () => {
    const { home, away, fixture } = managers();
    const selected = availableImpactSubs(home).find((pick) => pick.benchRole === "DEF")!;
    const seed = "same-172879-4";
    const plan = createImpactSubPlan({ manager: home, playerId: selected.player.i, seed })!;
    const result = simulateFixture({
      fixture,
      home,
      away,
      seed,
      homeImpactSubPlayerId: selected.player.i,
      homeCasualty: {
        kind: "injury",
        weightByPlayerId: Object.fromEntries(
          home.picks.map((pick) => [
            pick.player.i,
            pick.player.i === plan.offPlayerId ? 1 : 0
          ])
        )
      },
      awayCasualty: null
    });
    const injury = result.events.find(
      (event) => event.code === "injury" && event.teamId === home.id
    )!;
    const selectedEntries = result.events.filter(
      (event) => event.code === "substitution" && event.playerId === selected.player.i
    );

    expect(injury.second).toBe(plan.minute);
    expect(selectedEntries).toHaveLength(1);
    expect(selectedEntries[0]).toMatchObject({
      second: plan.minute + 1,
      params: { impactSub: 1 }
    });
  });

  it("still emits the selected Impact Sub when an early red empties its planned line", () => {
    const home = autoDraftManager({
      id: "home",
      displayName: "Home",
      formationId: "5-4-1",
      seed: "impact-empty-line-home"
    });
    const away = autoDraftManager({
      id: "away",
      displayName: "Away",
      formationId: "4-3-3",
      seed: "impact-empty-line-away"
    });
    const fixture = { id: "impact-empty-line", round: 1, homeId: "home", awayId: "away" };
    const selected = availableImpactSubs(home).find((pick) => pick.benchRole === "ATT")!;
    let checkedEarlyRed = false;

    for (let index = 0; index < 160; index += 1) {
      const seed = `impact-empty-line-${index}`;
      const plan = createImpactSubPlan({ manager: home, playerId: selected.player.i, seed })!;
      const result = simulateFixture({
        fixture,
        home,
        away,
        seed,
        homeImpactSubPlayerId: selected.player.i,
        homeCasualty: {
          kind: "redCard",
          weightByPlayerId: Object.fromEntries(
            home.picks.map((pick) => [pick.player.i, pick.player.i === plan.offPlayerId ? 1 : 0])
          )
        },
        awayCasualty: null
      });
      const red = result.events.find((event) => event.code === "red_card" && event.teamId === home.id)!;
      if (red.second >= plan.minute) continue;

      checkedEarlyRed = true;
      expect(result.events.find((event) => event.params.impactSub === 1)).toMatchObject({
        code: "substitution",
        playerId: selected.player.i,
        second: plan.minute
      });
      break;
    }

    expect(checkedEarlyRed).toBe(true);
  });

  it("moves a later natural casualty from the actual early-red fallback to the Impact player", () => {
    const home = autoDraftManager({
      id: "home",
      displayName: "Home",
      formationId: "5-4-1",
      seed: "nat-home"
    });
    const away = autoDraftManager({
      id: "away",
      displayName: "Away",
      formationId: "4-3-3",
      seed: "nat-away"
    });
    const fixture = { id: "natural-fallback", round: 1, homeId: "home", awayId: "away" };
    const selected = availableImpactSubs(home).find((pick) => pick.benchRole === "ATT")!;
    const seed = "natx-20169";
    const plan = createImpactSubPlan({ manager: home, playerId: selected.player.i, seed })!;
    const result = simulateFixture({
      fixture,
      home,
      away,
      seed,
      homeImpactSubPlayerId: selected.player.i,
      awayCasualty: null
    });
    const red = result.events.find(
      (event) => event.code === "red_card" && event.teamId === home.id
    )!;
    const impactEvent = result.events.find((event) => event.params.impactSub === 1)!;
    const laterInjury = result.events.find(
      (event) =>
        event.code === "injury" &&
        event.teamId === home.id &&
        event.second > impactEvent.second
    )!;
    const injuryReplacement = result.events.find(
      (event) =>
        event.code === "substitution" &&
        event.teamId === home.id &&
        event.second === laterInjury.second + 1
    )!;

    expect(red).toMatchObject({
      playerId: plan.offPlayerId
    });
    expect(red.second).toBeLessThan(plan.minute);
    expect(impactEvent.params.off).not.toBe(plan.offPlayerName);
    expect(laterInjury).toMatchObject({
      playerId: selected.player.i,
      playerName: selected.player.n
    });
    expect(injuryReplacement.params.off).toBe(selected.player.n);
    expect(
      result.events.some(
        (event) =>
          (event.code === "injury" || event.code === "red_card") &&
          event.second > impactEvent.second &&
          event.playerName === impactEvent.params.off
      )
    ).toBe(false);
  });

  it("never changes the seeded score story before the Impact Sub enters", () => {
    const { home, away, fixture } = managers();
    const selected = availableImpactSubs(home).find((pick) => pick.benchRole === "ATT")!;
    let foundChangedResult = false;

    for (let index = 0; index < 180; index += 1) {
      const seed = `impact-timing-${index}`;
      const plan = createImpactSubPlan({ manager: home, playerId: selected.player.i, seed })!;
      const base = simulateFixture({ fixture, home, away, seed, homeCasualty: null, awayCasualty: null });
      const impact = simulateFixture({
        fixture,
        home,
        away,
        seed,
        homeImpactSubPlayerId: selected.player.i,
        homeCasualty: null,
        awayCasualty: null
      });
      if (base.homeGoals === impact.homeGoals && base.awayGoals === impact.awayGoals) continue;

      foundChangedResult = true;
      const earlyGoals = (result: typeof base) => result.events
        .filter((event) => event.code === "goal" && event.second <= plan.minute)
        .map((event) => [event.second, event.teamId, event.playerId]);
      expect(earlyGoals(impact)).toEqual(earlyGoals(base));
      expect(
        impact.events
          .filter((event) => event.code === "goal" && event.second > plan.minute)
          .length
      ).not.toBe(
        base.events
          .filter((event) => event.code === "goal" && event.second > plan.minute)
          .length
      );
      break;
    }

    expect(foundChangedResult).toBe(true);
  });

  it("nudges results without guaranteeing wins", () => {
    const { home, away, fixture } = managers();
    const selected = availableImpactSubs(home).find((pick) => pick.benchRole === "ATT")!;
    let basePoints = 0;
    let impactPoints = 0;
    let impactLosses = 0;

    for (let index = 0; index < 900; index += 1) {
      const seed = `impact-balance-${index}`;
      const base = simulateFixture({ fixture, home, away, seed });
      const impact = simulateFixture({
        fixture,
        home,
        away,
        seed,
        homeImpactSubPlayerId: selected.player.i
      });
      basePoints += base.homeGoals > base.awayGoals ? 3 : base.homeGoals === base.awayGoals ? 1 : 0;
      impactPoints += impact.homeGoals > impact.awayGoals ? 3 : impact.homeGoals === impact.awayGoals ? 1 : 0;
      if (impact.homeGoals < impact.awayGoals) impactLosses += 1;
    }

    expect(impactPoints).toBeGreaterThan(basePoints);
    expect(impactLosses).toBeGreaterThan(0);
  });

  it("lets a defensive impact sub suppress opposition threat", () => {
    const { home, away, fixture } = managers();
    const selected = availableImpactSubs(home).find((pick) => pick.benchRole === "DEF")!;
    let baseGoalsAgainst = 0;
    let protectedGoalsAgainst = 0;

    for (let index = 0; index < 700; index += 1) {
      const seed = `protect-balance-${index}`;
      baseGoalsAgainst += simulateFixture({ fixture, home, away, seed }).awayGoals;
      protectedGoalsAgainst += simulateFixture({
        fixture,
        home,
        away,
        seed,
        homeImpactSubPlayerId: selected.player.i
      }).awayGoals;
    }

    expect(protectedGoalsAgainst).toBeLessThan(baseGoalsAgainst);
  });

  it("exposes two charges for either mode and clamps remaining usage", () => {
    expect(MINILEAGUE_IMPACT_SUB_LIMIT).toBe(2);
    expect(INVINCIBLE_IMPACT_SUB_LIMIT).toBe(2);
    expect(remainingImpactSubs(0, MINILEAGUE_IMPACT_SUB_LIMIT)).toBe(2);
    expect(remainingImpactSubs(1, MINILEAGUE_IMPACT_SUB_LIMIT)).toBe(1);
    expect(remainingImpactSubs(10, MINILEAGUE_IMPACT_SUB_LIMIT)).toBe(0);
  });
});
