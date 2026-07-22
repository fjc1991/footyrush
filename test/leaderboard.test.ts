import { describe, expect, it } from "vitest";
import { aggregateLeaderboard, periodStart, recordsFromLeague } from "@/lib/game/leaderboard";
import type { LeaderboardRecord, ManagerSquad, Standing } from "@/lib/game/types";

describe("leaderboards", () => {
  const now = new Date("2026-06-08T12:00:00.000Z");
  const records: LeaderboardRecord[] = [
    {
      id: "a",
      userId: "a",
      displayName: "A",
      kind: "human",
      competitionMode: "minileague",
      runId: "run-a",
      gamesPlayed: 5,
      finalPosition: 2,
      periodAt: now.toISOString(),
      matchPoints: 9,
      goalDifference: 2,
      goalsFor: 7,
      leagueTitles: 0,
      opponentStrength: 1000,
      completedAt: now.toISOString()
    },
    {
      id: "b",
      userId: "b",
      displayName: "B",
      kind: "human",
      competitionMode: "minileague",
      runId: "run-b",
      gamesPlayed: 5,
      finalPosition: 3,
      periodAt: now.toISOString(),
      matchPoints: 9,
      goalDifference: 5,
      goalsFor: 6,
      leagueTitles: 0,
      opponentStrength: 1000,
      completedAt: now.toISOString()
    }
  ];

  it("uses UTC period starts", () => {
    expect(periodStart(now, "daily").toISOString()).toBe("2026-06-08T00:00:00.000Z");
    expect(periodStart(now, "weekly").toISOString()).toBe("2026-06-08T00:00:00.000Z");
    expect(periodStart(now, "monthly").toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(periodStart(now, "all_time").toISOString()).toBe("1970-01-01T00:00:00.000Z");
  });

  it("ranks cumulative points with goal difference tiebreak", () => {
    const leaderboard = aggregateLeaderboard(records, "daily", now);
    expect(leaderboard[0].displayName).toBe("B");
    expect(leaderboard[0].rank).toBe(1);
  });

  it("aggregates repeated records by user within the selected period", () => {
    const leaderboard = aggregateLeaderboard(
      [
        ...records,
        {
          ...records[0],
          id: "a-later",
          matchPoints: 4,
          goalDifference: 1,
          goalsFor: 3,
          completedAt: new Date("2026-06-08T13:00:00.000Z").toISOString()
        }
      ],
      "daily",
      now
    );

    expect(leaderboard).toHaveLength(2);
    expect(leaderboard[0]).toMatchObject({
      userId: "a",
      matchPoints: 13,
      goalDifference: 3,
      goalsFor: 10,
      gamesPlayed: 10,
      runsCompleted: 2,
      rank: 1
    });
  });

  it("ranks championships before points on a title leaderboard", () => {
    const leaderboard = aggregateLeaderboard(
      [
        { ...records[0], matchPoints: 15, leagueTitles: 0 },
        { ...records[1], matchPoints: 4, leagueTitles: 1 }
      ],
      "all_time",
      now,
      "titles"
    );

    expect(leaderboard.map((entry) => entry.userId)).toEqual(["b", "a"]);
  });

  it("combines titles across formats while preserving the mode split", () => {
    const leaderboard = aggregateLeaderboard(
      [
        { ...records[0], leagueTitles: 1 },
        {
          ...records[0],
          id: "a-invincible",
          runId: "run-a-invincible",
          competitionMode: "invincible",
          gamesPlayed: 38,
          finalPosition: 1,
          leagueTitles: 1
        }
      ],
      "all_time",
      now,
      "titles"
    );

    expect(leaderboard[0]).toMatchObject({
      leagueTitles: 2,
      miniLeagueTitles: 1,
      invincibleTitles: 1,
      gamesPlayed: 43,
      finalPosition: 1,
      runsCompleted: 2
    });
  });

  it("does not compare five-match and 38-match points when title totals tie", () => {
    const leaderboard = aggregateLeaderboard(
      [
        { ...records[0], matchPoints: 15, leagueTitles: 1 },
        {
          ...records[1],
          competitionMode: "invincible",
          gamesPlayed: 38,
          matchPoints: 95,
          leagueTitles: 1
        }
      ],
      "all_time",
      now,
      "titles"
    );

    expect(leaderboard.map((entry) => entry.userId)).toEqual(["a", "b"]);
  });

  it("includes old records throughout an all-time window", () => {
    const old = { ...records[0], periodAt: "2020-01-01T00:00:00.000Z", completedAt: "2020-01-01T00:00:00.000Z" };
    expect(aggregateLeaderboard([old], "daily", now)).toHaveLength(0);
    expect(aggregateLeaderboard([old], "all_time", now)).toHaveLength(1);
  });

  it("creates records only for human managers", () => {
    const managers = [
      { id: "human", displayName: "Tester", kind: "human", mmr: 1000 },
      { id: "reserve-1", displayName: "Reserve", kind: "reserve", mmr: 950 }
    ] as ManagerSquad[];
    const standings = [
      {
        managerId: "reserve-1",
        displayName: "Reserve",
        kind: "reserve",
        played: 5,
        wins: 4,
        draws: 0,
        losses: 1,
        goalsFor: 9,
        goalsAgainst: 4,
        goalDifference: 5,
        points: 12
      },
      {
        managerId: "human",
        displayName: "Tester",
        kind: "human",
        played: 5,
        wins: 3,
        draws: 0,
        losses: 2,
        goalsFor: 8,
        goalsAgainst: 6,
        goalDifference: 2,
        points: 9
      }
    ] as Standing[];

    const leagueRecords = recordsFromLeague({
      managers,
      standings,
      completedAt: now.toISOString(),
      competitionMode: "invincible",
      runId: "season-1"
    });

    expect(leagueRecords).toHaveLength(1);
    expect(leagueRecords[0]).toMatchObject({
      userId: "human",
      leagueTitles: 0,
      competitionMode: "invincible",
      runId: "season-1",
      gamesPlayed: 5,
      finalPosition: 2
    });
  });
});
