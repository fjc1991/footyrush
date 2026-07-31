import { beforeAll, describe, expect, it } from "vitest";
import rawData from "../data.json";
import { seedFootballData } from "@/lib/game/data";
import { autoDraftManager } from "@/lib/game/draft";
import { createMinileague } from "@/lib/game/matchmaking";
import {
  INVINCIBLE_CONTENDER_XG_BONUS,
  INVINCIBLE_MANAGER_RATING_CAP,
  INVINCIBLE_MAX_SEASON_CASUALTIES,
  INVINCIBLE_MIN_SEASON_CASUALTIES,
  SEASON_OUT_OF_FORM_CHANCE,
  applySeasonFixtureInjuries,
  applySeasonFixtureSuspensions,
  availableSeasonBench,
  buildDoubleRoundRobin,
  buildSeasonCasualtySchedule,
  canUseSeasonImpactSub,
  createInvincibleSeason,
  createSeasonPregame,
  decrementSeasonAbsences,
  decrementSeasonInjuries,
  invincibleContenderModifiers,
  markSeasonImpactSubUsed,
  managerForSeasonMatch,
  remainingSeasonImpactSubs,
  seasonMissingRequiredSubstitutions
} from "@/lib/game/season";
import { createRng } from "@/lib/game/rng";
import { calculateSquadStrength, computeStandings, simulateFixture } from "@/lib/game/simulation";
import type { FixtureResult, ManagerSquad, RawFootballData } from "@/lib/game/types";

beforeAll(() => {
  seedFootballData(rawData as unknown as RawFootballData);
});

function human(seed = "season-human"): ManagerSquad {
  return autoDraftManager({ id: "human", displayName: "Human", formationId: "4-3-3", seed });
}

describe("Be Invincible season", () => {
  it("creates a 20-team, 38-matchday double round robin", () => {
    const base = human();
    const season = createInvincibleSeason({
      humanPicks: base.picks,
      humanName: "Tester",
      formationId: base.formationId,
      mode: "classic",
      completedLeagues: 0,
      mmr: 200,
      managerRating: 55,
      attemptId: "attempt-1",
      seed: "season-create"
    });

    expect(season.managers).toHaveLength(20);
    expect(season.managers[0].managerRating).toBe(55);
    expect(season.rounds).toHaveLength(38);
    expect(season.rounds.every((round) => round.length === 10)).toBe(true);
    expect(season.rounds.filter((round) => round.some((fixture) => fixture.homeId === "human" || fixture.awayId === "human"))).toHaveLength(38);

    const allFixtures = season.rounds.flat();
    expect(allFixtures).toHaveLength(380);
    for (const manager of season.managers) {
      const played = allFixtures.filter((fixture) => fixture.homeId === manager.id || fixture.awayId === manager.id);
      expect(played).toHaveLength(38);
    }
  });

  it("builds reproducible four-or-five incident arcs with a clear finale and recovery beats", () => {
    const counts = new Set<number>();

    for (let index = 0; index < 80; index += 1) {
      const seed = `incident-arc-${index}`;
      const schedule = buildSeasonCasualtySchedule({ totalMatchdays: 38, rng: createRng(seed) });
      const repeated = buildSeasonCasualtySchedule({ totalMatchdays: 38, rng: createRng(seed) });
      const entries = Object.entries(schedule)
        .map(([matchday, kind]) => ({ matchday: Number(matchday), kind }))
        .sort((first, second) => first.matchday - second.matchday);

      expect(schedule).toEqual(repeated);
      expect(entries.length).toBeGreaterThanOrEqual(INVINCIBLE_MIN_SEASON_CASUALTIES);
      expect(entries.length).toBeLessThanOrEqual(INVINCIBLE_MAX_SEASON_CASUALTIES);
      expect(entries.some(({ kind }) => kind === "redCard")).toBe(true);
      expect(schedule[37]).toBeUndefined();

      entries.forEach(({ matchday }, incidentIndex) => {
        const stratumStart = Math.floor((incidentIndex * 37) / entries.length);
        const stratumEnd = Math.floor(((incidentIndex + 1) * 37) / entries.length) - 1;
        expect(matchday).toBeGreaterThanOrEqual(stratumStart);
        expect(matchday).toBeLessThanOrEqual(stratumEnd);
        if (incidentIndex > 0) {
          expect(matchday - entries[incidentIndex - 1].matchday).toBeGreaterThanOrEqual(3);
        }
      });
      counts.add(entries.length);
    }

    expect([...counts].sort()).toEqual([
      INVINCIBLE_MIN_SEASON_CASUALTIES,
      INVINCIBLE_MAX_SEASON_CASUALTIES
    ]);
  });

  it("caps a short season at four incidents when a fifth would remove feasible recovery beats", () => {
    const schedule = buildSeasonCasualtySchedule({
      totalMatchdays: 11,
      rng: () => 0.999999
    });
    const matchdays = Object.keys(schedule).map(Number).sort((first, second) => first - second);

    expect(matchdays).toEqual([0, 3, 6, 9]);
    expect(schedule[10]).toBeUndefined();
    matchdays.slice(1).forEach((matchday, index) => {
      expect(matchday - matchdays[index]).toBeGreaterThanOrEqual(3);
    });
  });

  it("keeps full-season standings arithmetic consistent", () => {
    const managers = Array.from({ length: 20 }, (_, index) =>
      autoDraftManager({ id: index === 0 ? "human" : `m-${index}`, displayName: `M ${index}`, formationId: "4-3-3", seed: `season-m-${index}` })
    );
    const rounds = buildDoubleRoundRobin(managers);
    const results: FixtureResult[] = [];

    for (const round of rounds) {
      for (const fixture of round) {
        const home = managers.find((manager) => manager.id === fixture.homeId)!;
        const away = managers.find((manager) => manager.id === fixture.awayId)!;
        results.push(simulateFixture({ fixture, home, away, seed: `season-table:${fixture.id}` }));
      }
    }

    const standings = computeStandings(managers, results);
    expect(standings).toHaveLength(20);
    for (const row of standings) {
      expect(row.played).toBe(38);
      expect(row.wins + row.draws + row.losses).toBe(38);
      expect(row.points).toBe(row.wins * 3 + row.draws);
    }
  });

  it("decrements timed injuries and applies fixture injuries for future games", () => {
    const base = human("injury-human");
    const starter = base.picks[0];
    const decremented = decrementSeasonInjuries({ [starter.player.i]: 2, [base.picks[1].player.i]: 1 });
    expect(decremented[starter.player.i]).toBe(1);
    expect(decremented[base.picks[1].player.i]).toBeUndefined();

    const result = simulateFixture({
      fixture: { id: "injury-fx", round: 1, homeId: "human", awayId: "away" },
      home: base,
      away: autoDraftManager({ id: "away", displayName: "Away", formationId: "4-4-2", seed: "injury-away" }),
      seed: "injury-result"
    });
    const applied = applySeasonFixtureInjuries({
      injuryGamesByPlayerId: {},
      result: { ...result, homeInjuries: [starter.player.i], awayInjuries: [] },
      seed: "injury-duration"
    });
    expect(applied.injuryGamesByPlayerId[starter.player.i]).toBeGreaterThanOrEqual(1);
    expect(applied.injuryGamesByPlayerId[starter.player.i]).toBeLessThanOrEqual(10);
  });

  it("makes short match injuries common, medium layoffs uncommon, and long layoffs rare", () => {
    const base = human("weighted-injury-human");
    const starter = base.picks[0];
    const result = simulateFixture({
      fixture: { id: "weighted-injury-fx", round: 1, homeId: "human", awayId: "away" },
      home: base,
      away: autoDraftManager({ id: "away", displayName: "Away", formationId: "4-4-2", seed: "weighted-injury-away" }),
      seed: "weighted-injury-result"
    });
    const durations = Array.from({ length: 1_000 }, (_, index) =>
      applySeasonFixtureInjuries({
        injuryGamesByPlayerId: {},
        result: { ...result, homeInjuries: [starter.player.i], awayInjuries: [] },
        seed: `weighted-injury-duration-${index}`
      }).newInjuries[0].games
    );
    const short = durations.filter((games) => games <= 3).length;
    const medium = durations.filter((games) => games >= 4 && games <= 6).length;
    const long = durations.filter((games) => games >= 7).length;

    expect(Math.min(...durations)).toBe(1);
    expect(Math.max(...durations)).toBe(10);
    expect(short).toBeGreaterThan(medium * 2);
    expect(medium).toBeGreaterThan(long * 2);
    expect(long).toBeGreaterThan(0);
    expect(long).toBeLessThan(120);
  });

  it("applies fixed three-game red-card suspensions and returns players automatically", () => {
    const base = human("suspension-human");
    const starter = base.picks[0];
    const result = simulateFixture({
      fixture: { id: "red-fx", round: 1, homeId: "human", awayId: "away" },
      home: base,
      away: autoDraftManager({ id: "away", displayName: "Away", formationId: "4-4-2", seed: "red-away" }),
      seed: "red-result"
    });
    const applied = applySeasonFixtureSuspensions({
      suspensionGamesByPlayerId: {},
      result: { ...result, homeRedCards: [starter.player.i], awayRedCards: [] }
    });

    expect(applied.suspensionGamesByPlayerId[starter.player.i]).toBe(3);
    expect(decrementSeasonAbsences(applied.suspensionGamesByPlayerId)[starter.player.i]).toBe(2);
    expect(decrementSeasonAbsences(decrementSeasonAbsences(decrementSeasonAbsences(applied.suspensionGamesByPlayerId)))[starter.player.i]).toBeUndefined();
  });

  it("blocks the next game until unavailable starters have valid distinct substitutes", () => {
    const base = human("blocked-sub-human");
    const starters = base.picks.filter((pick) => pick.target !== "SUB");
    const starter = starters[0];
    const secondStarter = starters[1];
    const sub = base.picks.find((pick) => pick.target === "SUB")!;
    const missing = seasonMissingRequiredSubstitutions({
      human: base,
      injuryGamesByPlayerId: { [starter.player.i]: 4 },
      suspensionGamesByPlayerId: {}
    });
    const resolved = seasonMissingRequiredSubstitutions({
      human: { ...base, substitutions: { [starter.player.i]: sub.player.i } },
      injuryGamesByPlayerId: { [starter.player.i]: 4 },
      suspensionGamesByPlayerId: {}
    });
    const stale = seasonMissingRequiredSubstitutions({
      human: { ...base, substitutions: { [starter.player.i]: sub.player.i } },
      injuryGamesByPlayerId: { [starter.player.i]: 4, [sub.player.i]: 1 },
      suspensionGamesByPlayerId: {}
    });
    const duplicate = seasonMissingRequiredSubstitutions({
      human: {
        ...base,
        substitutions: { [starter.player.i]: sub.player.i, [secondStarter.player.i]: sub.player.i }
      },
      injuryGamesByPlayerId: { [starter.player.i]: 4 },
      suspensionGamesByPlayerId: { [secondStarter.player.i]: 2 }
    });
    const starterAsSub = seasonMissingRequiredSubstitutions({
      human: { ...base, substitutions: { [starter.player.i]: secondStarter.player.i } },
      injuryGamesByPlayerId: { [starter.player.i]: 4 },
      suspensionGamesByPlayerId: {}
    });
    const unknownSub = seasonMissingRequiredSubstitutions({
      human: { ...base, substitutions: { [starter.player.i]: 987_654_321 } },
      injuryGamesByPlayerId: { [starter.player.i]: 4 },
      suspensionGamesByPlayerId: {}
    });

    expect(missing.map((pick) => pick.player.i)).toContain(starter.player.i);
    expect(resolved).toHaveLength(0);
    expect(stale.map((pick) => pick.player.i)).toContain(starter.player.i);
    expect(duplicate).toHaveLength(1);
    expect(duplicate[0].player.i).toBe(secondStarter.player.i);
    expect(starterAsSub.map((pick) => pick.player.i)).toContain(starter.player.i);
    expect(unknownSub.map((pick) => pick.player.i)).toContain(starter.player.i);
  });

  it("does not deadlock when absences outnumber the healthy bench", () => {
    const base = human("depleted-bench-human");
    const starters = base.picks.filter((pick) => pick.target !== "SUB").slice(0, 2);
    const bench = base.picks.filter((pick) => pick.target === "SUB");
    const onlyHealthySub = bench[0];
    const unavailable = Object.fromEntries([
      ...starters.map((pick) => [pick.player.i, 2]),
      ...bench.slice(1).map((pick) => [pick.player.i, 2])
    ]);
    const oneChoice = seasonMissingRequiredSubstitutions({
      human: base,
      injuryGamesByPlayerId: unavailable
    });
    const resolvedCapacity = seasonMissingRequiredSubstitutions({
      human: {
        ...base,
        substitutions: { [oneChoice[0].player.i]: onlyHealthySub.player.i }
      },
      injuryGamesByPlayerId: unavailable
    });

    expect(oneChoice).toHaveLength(1);
    expect(resolvedCapacity).toHaveLength(0);
  });

  it("caps the appointed-manager advantage for the full-season challenge", () => {
    const base = human("manager-cap-human");
    const season = createInvincibleSeason({
      humanPicks: base.picks,
      humanName: "Tester",
      formationId: base.formationId,
      mode: "classic",
      completedLeagues: 0,
      mmr: 200,
      managerRating: 100,
      attemptId: "attempt-manager-cap",
      seed: "season-manager-cap"
    });

    expect(season.managers[0].managerRating).toBe(INVINCIBLE_MANAGER_RATING_CAP);

    const miniLeague = createMinileague({
      humanPicks: base.picks,
      humanName: "Tester",
      formationId: base.formationId,
      mode: "classic",
      completedLeagues: 0,
      mmr: 200,
      managerRating: 100,
      seed: "mini-manager-uncapped"
    });
    expect(miniLeague.managers[0].managerRating).toBe(100);
  });

  it("backs the two strongest title challengers only against the AI field", () => {
    const base = human("contender-human");
    const eliteHuman = {
      ...base,
      picks: base.picks.map((pick) => ({ ...pick, effectiveRating: Math.max(pick.effectiveRating, 96) }))
    };
    const opponents = Array.from({ length: 4 }, (_, index) =>
      autoDraftManager({
        id: `contender-${index + 1}`,
        displayName: `Contender ${index + 1}`,
        formationId: "4-3-3",
        seed: `contender-opponent-${index}`
      })
    );
    const managers = [eliteHuman, ...opponents];
    const ranked = [...opponents].sort(
      (first, second) =>
        calculateSquadStrength(second).overall - calculateSquadStrength(first).overall || first.id.localeCompare(second.id)
    );
    const contender = ranked[0];
    const other = ranked[2];

    expect(
      invincibleContenderModifiers(
        { id: "human-fixture", round: 1, homeId: "human", awayId: contender.id },
        managers
      )
    ).toEqual({ homeExpectedGoalsModifier: 0, awayExpectedGoalsModifier: 0 });
    expect(
      invincibleContenderModifiers(
        { id: "contender-fixture", round: 1, homeId: contender.id, awayId: ranked[1].id },
        managers
      )
    ).toEqual({ homeExpectedGoalsModifier: 0, awayExpectedGoalsModifier: 0 });
    expect(
      invincibleContenderModifiers(
        { id: "field-fixture", round: 1, homeId: contender.id, awayId: other.id },
        managers
      )
    ).toEqual({ homeExpectedGoalsModifier: INVINCIBLE_CONTENDER_XG_BONUS, awayExpectedGoalsModifier: 0 });
    expect(
      invincibleContenderModifiers(
        { id: "away-contender", round: 1, homeId: other.id, awayId: contender.id },
        managers
      )
    ).toEqual({ homeExpectedGoalsModifier: 0, awayExpectedGoalsModifier: INVINCIBLE_CONTENDER_XG_BONUS });
    expect(
      invincibleContenderModifiers(
        { id: "field-only", round: 1, homeId: ranked[2].id, awayId: ranked[3].id },
        managers
      )
    ).toEqual({ homeExpectedGoalsModifier: 0, awayExpectedGoalsModifier: 0 });

    const outmatchedHuman = {
      ...base,
      picks: base.picks.map((pick) => ({ ...pick, effectiveRating: Math.min(pick.effectiveRating, 60) }))
    };
    expect(
      invincibleContenderModifiers(
        { id: "natural-pressure", round: 1, homeId: contender.id, awayId: other.id },
        [outmatchedHuman, ...opponents]
      )
    ).toEqual({ homeExpectedGoalsModifier: 0, awayExpectedGoalsModifier: 0 });
  });

  it("limits impact substitutes to one per half of the season", () => {
    const base = human("impact-sub-human");
    const season = createInvincibleSeason({
      humanPicks: base.picks,
      humanName: "Tester",
      formationId: base.formationId,
      mode: "classic",
      completedLeagues: 0,
      mmr: 200,
      managerRating: 55,
      attemptId: "attempt-impact-subs",
      seed: "season-impact-subs"
    });

    expect(remainingSeasonImpactSubs(season)).toBe(2);
    expect(canUseSeasonImpactSub(season)).toBe(true);
    const firstUsed = { ...season, impactSubsUsedByHalf: markSeasonImpactSubUsed(season) };
    expect(canUseSeasonImpactSub(firstUsed)).toBe(false);
    expect(remainingSeasonImpactSubs(firstUsed)).toBe(1);
    const secondHalf = { ...firstUsed, currentMatchday: 19 };
    expect(canUseSeasonImpactSub(secondHalf)).toBe(true);
    expect(remainingSeasonImpactSubs(secondHalf)).toBe(1);
    expect(
      remainingSeasonImpactSubs({
        ...season,
        currentMatchday: 19,
        impactSubsUsedByHalf: { first: false, second: false }
      })
    ).toBe(1);
    const allUsed = { ...secondHalf, impactSubsUsedByHalf: markSeasonImpactSubUsed(secondHalf) };
    expect(remainingSeasonImpactSubs(allUsed)).toBe(0);
  });

  it("supports one-match out-of-form substitutions without permanently changing the manager", () => {
    const base = human("form-human");
    const starter = base.picks.find((pick) => pick.target !== "SUB")!;
    const sub = availableSeasonBench(base, {}, [starter.player.i])[0]!;
    const matchManager = managerForSeasonMatch({
      human: base,
      injuryGamesByPlayerId: {},
      outOfFormPlayerId: starter.player.i,
      outOfFormSubstituteId: sub.player.i
    });

    expect(matchManager.injuredPlayerIds).toContain(starter.player.i);
    expect(matchManager.substitutions[starter.player.i]).toBe(sub.player.i);
    expect(base.injuredPlayerIds).toHaveLength(0);
    expect(base.substitutions[starter.player.i]).toBeUndefined();
  });

  it("reserves out-of-form decisions for healthy weeks", () => {
    const base = human("forced-events");
    const trainingWeek = createSeasonPregame({
      human: base,
      matchday: 4,
      injuryGamesByPlayerId: {},
      seed: "forced-events",
      trainingInjuryChance: 1,
      outOfFormChance: 1
    });
    const healthyWeek = createSeasonPregame({
      human: base,
      matchday: 5,
      injuryGamesByPlayerId: {},
      seed: "forced-form",
      trainingInjuryChance: 0,
      outOfFormChance: 1
    });

    expect(trainingWeek.decision.trainingInjury).toBeTruthy();
    expect(trainingWeek.decision.outOfForm).toBeUndefined();
    expect(healthyWeek.decision.trainingInjury).toBeUndefined();
    expect(healthyWeek.decision.outOfForm).toBeTruthy();
  });

  it("accounts for injuries and suspensions before offering an out-of-form choice", () => {
    const base = human("unavailable-form");
    const suspendedStarter = base.picks.find(
      (pick) => pick.target !== "SUB" && !pick.player.p.includes("GK")
    )!;
    const injuredSub = base.picks.find((pick) => pick.target === "SUB")!;
    const suspendedWeek = createSeasonPregame({
      human: base,
      matchday: 6,
      injuryGamesByPlayerId: {},
      suspensionGamesByPlayerId: { [suspendedStarter.player.i]: 2 },
      seed: "suspended-form",
      trainingInjuryChance: 1,
      outOfFormChance: 1
    });
    const injuredWeek = createSeasonPregame({
      human: base,
      matchday: 7,
      injuryGamesByPlayerId: { [injuredSub.player.i]: 2 },
      suspensionGamesByPlayerId: {},
      seed: "injured-form",
      trainingInjuryChance: 0,
      outOfFormChance: 1
    });

    expect(suspendedWeek.decision.trainingInjury?.playerId).not.toBe(suspendedStarter.player.i);
    expect(suspendedWeek.decision.outOfForm).toBeUndefined();
    expect(injuredWeek.decision.outOfForm).toBeUndefined();
  });

  it("activates out-of-form decisions at six percent by default", () => {
    const base = human("default-form-rate");
    let decisions = 0;
    for (let index = 0; index < 1_000; index += 1) {
      const prepared = createSeasonPregame({
        human: base,
        matchday: index % 38,
        injuryGamesByPlayerId: {},
        suspensionGamesByPlayerId: {},
        seed: `default-form-${index}`
      });
      if (prepared.decision.outOfForm) {
        decisions += 1;
      }
    }

    expect(SEASON_OUT_OF_FORM_CHANCE).toBe(0.06);
    expect(decisions).toBeGreaterThanOrEqual(40);
    expect(decisions).toBeLessThanOrEqual(80);
  });

});
