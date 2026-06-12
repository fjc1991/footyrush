import type { LeaderboardEntry, LeaderboardRecord, ManagerSquad, Period, Standing } from "./types";

export function periodStart(date: Date, period: Period): Date {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  if (period === "weekly") {
    const day = start.getUTCDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setUTCDate(start.getUTCDate() - diff);
  }
  if (period === "monthly") {
    start.setUTCDate(1);
  }
  return start;
}

export function aggregateLeaderboard(records: LeaderboardRecord[], period: Period, now = new Date()): LeaderboardEntry[] {
  const start = periodStart(now, period);
  const end = new Date(start);
  if (period === "daily") {
    end.setUTCDate(end.getUTCDate() + 1);
  } else if (period === "weekly") {
    end.setUTCDate(end.getUTCDate() + 7);
  } else {
    end.setUTCMonth(end.getUTCMonth() + 1);
  }

  const userRows = new Map<string, LeaderboardRecord & { recordCount: number }>();
  records.forEach((record) => {
    const date = new Date(record.periodAt);
    if (date < start || date >= end) {
      return;
    }
    const key = record.userId;
    const current = userRows.get(key);
    if (!current) {
      userRows.set(key, { ...record, id: `${record.userId}-${period}-${start.toISOString()}`, recordCount: 1 });
      return;
    }
    const recordCompletedAt = new Date(record.completedAt).getTime();
    const currentCompletedAt = new Date(current.completedAt).getTime();
    const latestRecord = recordCompletedAt >= currentCompletedAt ? record : current;
    const nextCount = current.recordCount + 1;
    userRows.set(key, {
      ...current,
      displayName: latestRecord.displayName,
      kind: latestRecord.kind,
      periodAt: current.periodAt < record.periodAt ? current.periodAt : record.periodAt,
      matchPoints: current.matchPoints + record.matchPoints,
      goalDifference: current.goalDifference + record.goalDifference,
      goalsFor: current.goalsFor + record.goalsFor,
      leagueTitles: current.leagueTitles + record.leagueTitles,
      opponentStrength: Math.round((current.opponentStrength * current.recordCount + record.opponentStrength) / nextCount),
      completedAt: latestRecord.completedAt,
      recordCount: nextCount
    });
  });

  const periodRows = Array.from(userRows.values())
    .map((row) => ({
      id: row.id,
      userId: row.userId,
      displayName: row.displayName,
      kind: row.kind,
      periodAt: row.periodAt,
      matchPoints: row.matchPoints,
      goalDifference: row.goalDifference,
      goalsFor: row.goalsFor,
      leagueTitles: row.leagueTitles,
      opponentStrength: row.opponentStrength,
      completedAt: row.completedAt
    }))
    .sort(
      (first, second) =>
        second.matchPoints - first.matchPoints ||
        second.goalDifference - first.goalDifference ||
        second.goalsFor - first.goalsFor ||
        second.leagueTitles - first.leagueTitles ||
        second.opponentStrength - first.opponentStrength ||
        new Date(first.completedAt).getTime() - new Date(second.completedAt).getTime()
    );

  return periodRows.map((record, index) => ({ ...record, rank: index + 1 }));
}

export function recordsFromLeague(params: {
  managers: ManagerSquad[];
  standings: Standing[];
  completedAt: string;
}): LeaderboardRecord[] {
  const championId = params.standings[0]?.managerId;
  const strengthByManager = new Map(params.managers.map((manager) => [manager.id, manager.mmr]));

  return params.standings
    .filter((standing) => standing.kind === "human")
    .map((standing) => ({
      id: `${standing.managerId}-${params.completedAt}`,
      userId: standing.managerId,
      displayName: standing.displayName,
      kind: standing.kind,
      periodAt: params.completedAt,
      matchPoints: standing.points,
      goalDifference: standing.goalDifference,
      goalsFor: standing.goalsFor,
      leagueTitles: championId === standing.managerId ? 1 : 0,
      opponentStrength: Math.round(
        params.managers
          .filter((manager) => manager.id !== standing.managerId)
          .reduce((sum, manager) => sum + (strengthByManager.get(manager.id) ?? 65), 0) / Math.max(1, params.managers.length - 1)
      ),
      completedAt: params.completedAt
    }));
}

export function demoLeaderboardRecords(now = new Date()): LeaderboardRecord[] {
  const names = ["Canal End FC", "Northbank 98", "Set Piece Union", "Old Boot Room", "Mersey Arcade"];
  return names.map((name, index) => ({
    id: `demo-${index}`,
    userId: `demo-${index}`,
    displayName: name,
    kind: "reserve",
    periodAt: new Date(now.getTime() - index * 2 * 60 * 60 * 1000).toISOString(),
    matchPoints: 11 - index,
    goalDifference: 7 - index,
    goalsFor: 12 - index,
    leagueTitles: index === 0 ? 1 : 0,
    opponentStrength: 62 + index * 2,
    completedAt: new Date(now.getTime() - index * 2 * 60 * 60 * 1000).toISOString()
  }));
}
