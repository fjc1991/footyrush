import { beforeAll, describe, expect, it } from "vitest";
import rawData from "../data.json";
import { seedFootballData } from "@/lib/game/data";
import { autoDraftManager } from "@/lib/game/draft";
import {
  TEAM_TALK_EXPECTED_GOALS_BONUS,
  applySeasonFixtureInjuries,
  applySeasonFixtureSuspensions,
  availableSeasonBench,
  buildDoubleRoundRobin,
  canUseSeasonTeamTalk,
  createInvincibleSeason,
  createSeasonPregame,
  decrementSeasonAbsences,
  decrementSeasonInjuries,
  markSeasonTeamTalkUsed,
  managerForSeasonMatch,
  remainingSeasonTeamTalks,
  seasonMissingRequiredSubstitutions
} from "@/lib/game/season";
import { computeStandings, simulateFixture } from "@/lib/game/simulation";
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

  it("blocks the next game until unavailable starters have substitutes", () => {
    const base = human("blocked-sub-human");
    const starter = base.picks.find((pick) => pick.target !== "SUB")!;
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

    expect(missing.map((pick) => pick.player.i)).toContain(starter.player.i);
    expect(resolved).toHaveLength(0);
  });

  it("limits team talks to one per half of the season", () => {
    const base = human("talks-human");
    const season = createInvincibleSeason({
      humanPicks: base.picks,
      humanName: "Tester",
      formationId: base.formationId,
      mode: "classic",
      completedLeagues: 0,
      mmr: 200,
      managerRating: 55,
      attemptId: "attempt-talks",
      seed: "season-talks"
    });

    expect(remainingSeasonTeamTalks(season)).toBe(2);
    expect(canUseSeasonTeamTalk(season)).toBe(true);
    const firstUsed = { ...season, teamTalksUsedByHalf: markSeasonTeamTalkUsed(season) };
    expect(canUseSeasonTeamTalk(firstUsed)).toBe(false);
    expect(remainingSeasonTeamTalks(firstUsed)).toBe(1);
    const secondHalf = { ...firstUsed, currentMatchday: 19 };
    expect(canUseSeasonTeamTalk(secondHalf)).toBe(true);
    const allUsed = { ...secondHalf, teamTalksUsedByHalf: markSeasonTeamTalkUsed(secondHalf) };
    expect(remainingSeasonTeamTalks(allUsed)).toBe(0);
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

  it("creates forced pre-match events for deterministic tests", () => {
    const base = human("forced-events");
    const prepared = createSeasonPregame({
      human: base,
      matchday: 4,
      injuryGamesByPlayerId: {},
      seed: "forced-events",
      trainingInjuryChance: 1,
      outOfFormChance: 1
    });

    expect(prepared.decision.trainingInjury).toBeTruthy();
    expect(prepared.decision.outOfForm).toBeTruthy();
  });

  it("team talks improve outcomes modestly without guaranteeing wins", () => {
    const home = human("boost-home");
    const away = autoDraftManager({ id: "away", displayName: "Away", formationId: "4-3-3", seed: "boost-away" });
    const fixture = { id: "boost-fx", round: 1, homeId: "human", awayId: "away" };
    let basePoints = 0;
    let boostedPoints = 0;
    let boostedWins = 0;
    let boostedLosses = 0;

    for (let index = 0; index < 900; index += 1) {
      const base = simulateFixture({ fixture, home, away, seed: `boost-${index}` });
      const boosted = simulateFixture({
        fixture,
        home,
        away,
        seed: `boost-${index}`,
        homeExpectedGoalsModifier: TEAM_TALK_EXPECTED_GOALS_BONUS
      });
      basePoints += base.homeGoals > base.awayGoals ? 3 : base.homeGoals === base.awayGoals ? 1 : 0;
      boostedPoints += boosted.homeGoals > boosted.awayGoals ? 3 : boosted.homeGoals === boosted.awayGoals ? 1 : 0;
      if (boosted.homeGoals > boosted.awayGoals) boostedWins += 1;
      if (boosted.homeGoals < boosted.awayGoals) boostedLosses += 1;
    }

    expect(boostedPoints).toBeGreaterThan(basePoints);
    expect(boostedWins).toBeLessThan(900);
    expect(boostedLosses).toBeGreaterThan(0);
  });
});
