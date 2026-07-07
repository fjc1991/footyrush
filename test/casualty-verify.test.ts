import { beforeAll, describe, expect, it } from "vitest";
import rawData from "../data.json";
import { seedFootballData } from "@/lib/game/data";
import { autoDraftManager } from "@/lib/game/draft";
import {
  INVINCIBLE_MAX_SEASON_CASUALTIES,
  applySeasonFixtureInjuries,
  applySeasonFixtureSuspensions,
  createInvincibleSeason,
  decrementSeasonAbsences,
  humanSeasonGoalsByPlayer,
  managerForSeasonMatch,
  seasonCasualtyWeights
} from "@/lib/game/season";
import { simulateFixture } from "@/lib/game/simulation";
import type { InvincibleSeason } from "@/lib/game/season";
import type { FixtureResult, RawFootballData } from "@/lib/game/types";

beforeAll(() => {
  seedFootballData(rawData as unknown as RawFootballData);
});

/** Plays a whole Be Invincible season the way FootyRushApp does, returning the human's casualties. */
function playSeason(index: number): { injuries: number; redCards: number; victimIds: number[]; topScorerIds: Set<number> } {
  const base = autoDraftManager({ id: "human", displayName: "Human", formationId: "4-3-3", seed: `casualty-${index}` });
  let season: InvincibleSeason = createInvincibleSeason({
    humanPicks: base.picks,
    humanName: "Human",
    formationId: base.formationId,
    mode: "classic",
    completedLeagues: 0,
    mmr: 200,
    managerRating: 55,
    attemptId: `attempt-${index}`,
    seed: `casualty-season-${index}`
  });
  // Pin the id (createInvincibleSeason stamps Date.now() into it) so match seeds are deterministic.
  season = { ...season, id: `casualty-fixed-${index}` };

  let injuries = 0;
  let redCards = 0;
  const victimIds: number[] = [];

  while (season.currentMatchday < season.rounds.length) {
    const fixture = season.rounds[season.currentMatchday].find((f) => f.homeId === "human" || f.awayId === "human")!;
    const humanBase = season.managers.find((m) => m.id === "human")!;
    const matchHuman = managerForSeasonMatch({
      human: humanBase,
      injuryGamesByPlayerId: season.injuryGamesByPlayerId,
      suspensionGamesByPlayerId: season.suspensionGamesByPlayerId
    });
    const home = fixture.homeId === "human" ? matchHuman : season.managers.find((m) => m.id === fixture.homeId)!;
    const away = fixture.awayId === "human" ? matchHuman : season.managers.find((m) => m.id === fixture.awayId)!;

    const scheduled = season.casualtySchedule[season.currentMatchday];
    const humanCasualty = scheduled
      ? { kind: scheduled, weightByPlayerId: seasonCasualtyWeights({ human: humanBase, results: season.results }) }
      : null;

    const result: FixtureResult = simulateFixture({
      fixture,
      home,
      away,
      seed: `${season.id}:${fixture.id}:${season.results.length}`,
      homeCasualty: fixture.homeId === "human" ? humanCasualty : undefined,
      awayCasualty: fixture.awayId === "human" ? humanCasualty : undefined
    });

    const humanInjuries = fixture.homeId === "human" ? result.homeInjuries : result.awayInjuries;
    const humanReds = fixture.homeId === "human" ? result.homeRedCards : result.awayRedCards;
    injuries += humanInjuries.length;
    redCards += humanReds.length;
    victimIds.push(...humanInjuries, ...humanReds);

    season = {
      ...season,
      results: [...season.results, result],
      currentMatchday: season.currentMatchday + 1,
      injuryGamesByPlayerId: applySeasonFixtureInjuries({
        injuryGamesByPlayerId: decrementSeasonAbsences(season.injuryGamesByPlayerId),
        result,
        seed: `${season.id}:post-injury:${season.currentMatchday}`
      }).injuryGamesByPlayerId,
      suspensionGamesByPlayerId: applySeasonFixtureSuspensions({
        suspensionGamesByPlayerId: decrementSeasonAbsences(season.suspensionGamesByPlayerId),
        result
      }).suspensionGamesByPlayerId
    };
  }

  const goals = humanSeasonGoalsByPlayer(season.results);
  const maxGoals = Math.max(0, ...Object.values(goals));
  const topScorerIds = new Set(
    Object.entries(goals)
      .filter(([, g]) => g === maxGoals && maxGoals > 0)
      .map(([id]) => Number(id))
  );

  const humanIds = new Set(base.picks.map((p) => p.player.i));
  for (const id of victimIds) expect(humanIds.has(id)).toBe(true);

  return { injuries, redCards, victimIds, topScorerIds };
}

describe("Be Invincible season casualty budget", () => {
  it(
    "never exceeds five casualties, sometimes has none, and targets the top scorer above chance",
    () => {
      const SEASONS = 80;
      const totals: number[] = [];
      let victims = 0;
      let topScorerHits = 0;

      for (let index = 0; index < SEASONS; index += 1) {
        const outcome = playSeason(index);
        const total = outcome.injuries + outcome.redCards;
        expect(total).toBeGreaterThanOrEqual(0);
        expect(total).toBeLessThanOrEqual(INVINCIBLE_MAX_SEASON_CASUALTIES);
        totals.push(total);
        victims += outcome.victimIds.length;
        topScorerHits += outcome.victimIds.filter((id) => outcome.topScorerIds.has(id)).length;
      }

      // Reaches the full range: at least one casualty-free season and one that spends much of the budget.
      expect(Math.min(...totals)).toBe(0);
      expect(Math.max(...totals)).toBeGreaterThanOrEqual(4);
      const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
      expect(mean).toBeGreaterThan(1.4);
      expect(mean).toBeLessThan(3.6);
      // The leading scorer(s) should absorb more than a uniform 1-of-11 share of the casualties.
      expect(topScorerHits / Math.max(1, victims)).toBeGreaterThan(0.12);
    },
    30000
  );
});
