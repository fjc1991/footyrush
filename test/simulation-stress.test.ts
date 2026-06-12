import { beforeAll, describe, expect, it } from "vitest";
import rawData from "../data.json";
import { seedFootballData } from "@/lib/game/data";
import { autoDraftManager } from "@/lib/game/draft";
import { createMinileague } from "@/lib/game/matchmaking";
import {
  applyFixtureInjuries,
  computeStandings,
  simulateFixture
} from "@/lib/game/simulation";
import type {
  Fixture,
  FixtureResult,
  ManagerSquad,
  RawFootballData
} from "@/lib/game/types";

beforeAll(() => {
  seedFootballData(rawData as unknown as RawFootballData);
});

function manager(id: string, formationId: string, seed: string): ManagerSquad {
  return autoDraftManager({ id, displayName: id, formationId, seed });
}

const FORMATIONS = ["4-3-3", "4-4-2", "4-2-4", "3-4-3", "3-5-2", "5-3-2", "5-4-1"];

/** All player ids that belong to a manager's squad. */
function squadIds(m: ManagerSquad): Set<number> {
  return new Set(m.picks.map((p) => p.player.i));
}

describe("simulation engine — per-fixture invariants (400 random matches)", () => {
  const fixture: Fixture = { id: "f1", round: 1, homeId: "home", awayId: "away" };

  it("holds structural invariants for every simulated fixture", () => {
    const home = manager("home", "4-3-3", "stress-home");
    const away = manager("away", "4-4-2", "stress-away");
    const homeIds = squadIds(home);
    const awayIds = squadIds(away);

    for (let i = 0; i < 400; i += 1) {
      const r = simulateFixture({ fixture, home, away, seed: `match-${i}` });

      // Goals are non-negative and within the sampler's hard cap (0..5).
      expect(r.homeGoals).toBeGreaterThanOrEqual(0);
      expect(r.awayGoals).toBeGreaterThanOrEqual(0);
      expect(r.homeGoals).toBeLessThanOrEqual(5);
      expect(r.awayGoals).toBeLessThanOrEqual(5);

      const goals = r.events.filter((e) => e.code === "goal");
      // Total goal events must equal the scoreline.
      expect(goals.length).toBe(r.homeGoals + r.awayGoals);
      // Per-team goal events must match each side's score.
      expect(goals.filter((e) => e.teamId === "home").length).toBe(r.homeGoals);
      expect(goals.filter((e) => e.teamId === "away").length).toBe(r.awayGoals);

      // Lifecycle events appear exactly once each.
      for (const code of ["kickoff", "half_time", "full_time"] as const) {
        expect(r.events.filter((e) => e.code === code).length).toBe(1);
      }

      // Events are time-ordered and within the match window.
      for (let k = 1; k < r.events.length; k += 1) {
        expect(r.events[k].second).toBeGreaterThanOrEqual(r.events[k - 1].second);
      }
      for (const e of r.events) {
        expect(e.second).toBeGreaterThanOrEqual(1);
        expect(e.second).toBeLessThanOrEqual(90);
        expect(e.id).toBeTruthy();
      }

      // Event ids are unique (they double as React keys).
      expect(new Set(r.events.map((e) => e.id)).size).toBe(r.events.length);

      // The half-time event reports only the goals scored before the break.
      const halfTime = r.events.find((e) => e.code === "half_time")!;
      const firstHalfGoals = (teamId: string) => goals.filter((e) => e.teamId === teamId && e.second <= 45).length;
      expect(halfTime.params.homeGoals).toBe(firstHalfGoals("home"));
      expect(halfTime.params.awayGoals).toBe(firstHalfGoals("away"));

      // Scorers, injured and sent-off players all belong to the correct squad.
      for (const e of goals) {
        const ids = e.teamId === "home" ? homeIds : awayIds;
        expect(ids.has(e.playerId!)).toBe(true);
      }
      for (const id of r.homeInjuries) expect(homeIds.has(id)).toBe(true);
      for (const id of r.awayInjuries) expect(awayIds.has(id)).toBe(true);
      for (const id of r.homeRedCards) expect(homeIds.has(id)).toBe(true);
      for (const id of r.awayRedCards) expect(awayIds.has(id)).toBe(true);

      // Each side loses at most one player to injury / red card per match.
      expect(r.homeInjuries.length).toBeLessThanOrEqual(1);
      expect(r.awayInjuries.length).toBeLessThanOrEqual(1);
      expect(r.homeRedCards.length).toBeLessThanOrEqual(1);
      expect(r.awayRedCards.length).toBeLessThanOrEqual(1);

      // A player never appears in a goal/chance/save/near-miss event after the
      // second they were injured or sent off.
      const offEvents = r.events.filter((e) => e.code === "injury" || e.code === "red_card");
      for (const off of offEvents) {
        const laterOnPitch = r.events.filter(
          (e) =>
            e.playerId === off.playerId &&
            e.second > off.second &&
            ["goal", "chance", "save", "near_miss"].includes(e.code)
        );
        expect(laterOnPitch).toHaveLength(0);
      }
    }
  });

  it("is fully deterministic for a given seed (deep equality)", () => {
    const home = manager("home", "4-3-3", "stress-home");
    const away = manager("away", "4-4-2", "stress-away");
    for (const seed of ["alpha", "bravo", "charlie", "delta", "echo"]) {
      const a = simulateFixture({ fixture, home, away, seed });
      const b = simulateFixture({ fixture, home, away, seed });
      // playedAt is a wall-clock timestamp; everything else must be identical.
      expect({ ...a, playedAt: 0 }).toEqual({ ...b, playedAt: 0 });
    }
  });

  it("produces varied scorelines across seeds (not a constant)", () => {
    const home = manager("home", "4-3-3", "stress-home");
    const away = manager("away", "4-4-2", "stress-away");
    const lines = new Set<string>();
    for (let i = 0; i < 120; i += 1) {
      const r = simulateFixture({ fixture, home, away, seed: `variety-${i}` });
      lines.add(`${r.homeGoals}-${r.awayGoals}`);
    }
    expect(lines.size).toBeGreaterThan(5);
  });
});

describe("simulation engine — home advantage", () => {
  it("gives the home side a higher average score for evenly matched squads", () => {
    // Same draft seed → identical squad strength on both sides, isolating the home bias.
    const a = manager("home", "4-3-3", "twin");
    const b = { ...manager("away", "4-3-3", "twin"), id: "away", displayName: "away" };
    const fixture: Fixture = { id: "f", round: 1, homeId: "home", awayId: "away" };

    let homeTotal = 0;
    let awayTotal = 0;
    const N = 800;
    for (let i = 0; i < N; i += 1) {
      const r = simulateFixture({ fixture, home: a, away: b, seed: `ha-${i}` });
      homeTotal += r.homeGoals;
      awayTotal += r.awayGoals;
    }
    expect(homeTotal / N).toBeGreaterThan(awayTotal / N);
  });
});

describe("simulation engine — full minileague invariants (60 leagues)", () => {
  it("keeps standings arithmetic consistent end to end", () => {
    for (let s = 0; s < 60; s += 1) {
      const humanPicks = manager("human", FORMATIONS[s % FORMATIONS.length], `picks-${s}`).picks;
      const league = createMinileague({
        humanPicks,
        humanName: "Tester",
        formationId: FORMATIONS[s % FORMATIONS.length],
        mode: "classic",
        completedLeagues: s % 7,
        mmr: 950 + (s % 5) * 60,
        seed: `league-${s}`
      });

      expect(league.managers).toHaveLength(6);
      expect(league.rounds).toHaveLength(5);

      // Play out every round exactly as the app does, carrying injuries forward.
      let managers = league.managers;
      const results: FixtureResult[] = [];
      for (const round of league.rounds) {
        expect(round).toHaveLength(3);
        for (const fx of round) {
          const h = managers.find((m) => m.id === fx.homeId)!;
          const a = managers.find((m) => m.id === fx.awayId)!;
          const r = simulateFixture({ fixture: fx, home: h, away: a, seed: `${league.id}:${fx.id}:${results.length}` });
          results.push(r);
          managers = applyFixtureInjuries(managers, r);
        }
        managers = managers.map((m) => ({ ...m, suspendedPlayerIds: [] }));
      }

      // Every manager plays each of the other five once.
      expect(results).toHaveLength(15);

      const standings = computeStandings(league.managers, results);

      let totalGoalsFor = 0;
      let totalGoalsAgainst = 0;
      let totalPoints = 0;
      for (const row of standings) {
        expect(row.played).toBe(5);
        expect(row.wins + row.draws + row.losses).toBe(row.played);
        expect(row.points).toBe(row.wins * 3 + row.draws);
        expect(row.goalDifference).toBe(row.goalsFor - row.goalsAgainst);
        totalGoalsFor += row.goalsFor;
        totalGoalsAgainst += row.goalsAgainst;
        totalPoints += row.points;
      }

      // Closed league: every goal scored is a goal conceded by someone.
      expect(totalGoalsFor).toBe(totalGoalsAgainst);

      // Points conservation: 3 per decisive match, 2 per drawn match.
      const draws = results.filter((r) => r.homeGoals === r.awayGoals).length;
      const decisive = results.length - draws;
      expect(totalPoints).toBe(decisive * 3 + draws * 2);

      // Table is sorted by points, then goal difference, then goals for.
      for (let i = 1; i < standings.length; i += 1) {
        const prev = standings[i - 1];
        const cur = standings[i];
        const ordered =
          prev.points > cur.points ||
          (prev.points === cur.points &&
            (prev.goalDifference > cur.goalDifference ||
              (prev.goalDifference === cur.goalDifference && prev.goalsFor >= cur.goalsFor)));
        expect(ordered).toBe(true);
      }
    }
  });
});

describe("simulation engine — survives a fully decimated squad", () => {
  it("does not throw when many starters are injured/suspended", () => {
    const home = manager("home", "4-3-3", "decimate-h");
    const away = manager("away", "4-4-2", "decimate-a");
    const fixture: Fixture = { id: "f", round: 1, homeId: "home", awayId: "away" };

    // Knock out the first 6 picks of each side (more than the bench can cover).
    const wounded = (m: ManagerSquad): ManagerSquad => ({
      ...m,
      injuredPlayerIds: m.picks.slice(0, 6).map((p) => p.player.i)
    });

    expect(() =>
      simulateFixture({ fixture, home: wounded(home), away: wounded(away), seed: "decimated" })
    ).not.toThrow();
  });

  it("does not use unavailable players in on-ball events when replacements are needed", () => {
    const home = manager("home", "4-3-3", "unavailable-h");
    const away = manager("away", "4-4-2", "unavailable-a");
    const fixture: Fixture = { id: "f", round: 1, homeId: "home", awayId: "away" };
    const homeOut = home.picks.slice(0, 5).map((p) => p.player.i);
    const awayOut = away.picks.slice(0, 5).map((p) => p.player.i);
    const woundedHome = { ...home, injuredPlayerIds: homeOut };
    const woundedAway = { ...away, suspendedPlayerIds: awayOut };

    for (let i = 0; i < 200; i += 1) {
      const result = simulateFixture({ fixture, home: woundedHome, away: woundedAway, seed: `unavailable-${i}` });
      const onBallEvents = result.events.filter((e) => ["goal", "chance", "save", "near_miss"].includes(e.code));
      expect(onBallEvents.some((event) => event.teamId === "home" && homeOut.includes(event.playerId!))).toBe(false);
      expect(onBallEvents.some((event) => event.teamId === "away" && awayOut.includes(event.playerId!))).toBe(false);
    }
  });
});
