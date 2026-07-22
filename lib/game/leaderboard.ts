import type {
  CompetitionMode,
  LeaderboardEntry,
  LeaderboardMetric,
  LeaderboardRecord,
  ManagerSquad,
  Period,
  Standing
} from "./types";

export function periodStart(date: Date, period: Period): Date {
  if (period === "all_time") {
    return new Date(0);
  }

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

function periodEnd(start: Date, period: Period): Date {
  if (period === "all_time") {
    return new Date(8_640_000_000_000_000);
  }

  const end = new Date(start);
  if (period === "daily") {
    end.setUTCDate(end.getUTCDate() + 1);
  } else if (period === "weekly") {
    end.setUTCDate(end.getUTCDate() + 7);
  } else {
    end.setUTCMonth(end.getUTCMonth() + 1);
  }
  return end;
}

function competitionModeOf(record: LeaderboardRecord): CompetitionMode {
  // Runtime fallback keeps locally cached and pre-migration records usable.
  return record.competitionMode === "invincible" ? "invincible" : "minileague";
}

function validCount(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value ?? 0)) : 0;
}

function validPosition(value: number | null | undefined): number | null {
  return Number.isFinite(value) && Number(value) > 0 ? Math.round(Number(value)) : null;
}

/**
 * Aggregate completed runs into one row per manager. Points boards use the
 * historical points-first order; title boards compare championships only, then
 * use format-neutral completion/name ordering. API callers should filter
 * incompatible competition formats before a points aggregation.
 */
export function aggregateLeaderboard(
  records: LeaderboardRecord[],
  period: Period,
  now = new Date(),
  metric: LeaderboardMetric = "points"
): LeaderboardEntry[] {
  const start = periodStart(now, period);
  const end = periodEnd(start, period);

  type AggregatedRecord = LeaderboardRecord & {
    recordCount: number;
    miniLeagueTitles: number;
    invincibleTitles: number;
  };
  const userRows = new Map<string, AggregatedRecord>();

  records.forEach((record) => {
    const timestamp = Date.parse(record.periodAt);
    if (!Number.isFinite(timestamp)) {
      return;
    }
    const date = new Date(timestamp);
    if (date < start || date >= end) {
      return;
    }

    const mode = competitionModeOf(record);
    const titles = validCount(record.leagueTitles);
    const normalized: LeaderboardRecord = {
      ...record,
      competitionMode: mode,
      runId: record.runId || record.id,
      gamesPlayed: validCount(record.gamesPlayed),
      finalPosition: validPosition(record.finalPosition)
    };
    const current = userRows.get(record.userId);
    if (!current) {
      userRows.set(record.userId, {
        ...normalized,
        id: `${record.userId}-${period}-${start.toISOString()}`,
        recordCount: 1,
        miniLeagueTitles: mode === "minileague" ? titles : 0,
        invincibleTitles: mode === "invincible" ? titles : 0
      });
      return;
    }

    const recordCompletedAt = Date.parse(normalized.completedAt);
    const currentCompletedAt = Date.parse(current.completedAt);
    const latestRecord = recordCompletedAt >= currentCompletedAt ? normalized : current;
    const nextCount = current.recordCount + 1;
    const positions = [current.finalPosition, normalized.finalPosition].filter(
      (position): position is number => position !== null
    );
    userRows.set(record.userId, {
      ...current,
      displayName: latestRecord.displayName,
      kind: latestRecord.kind,
      competitionMode: latestRecord.competitionMode,
      runId: latestRecord.runId,
      periodAt: current.periodAt < normalized.periodAt ? current.periodAt : normalized.periodAt,
      matchPoints: current.matchPoints + normalized.matchPoints,
      goalDifference: current.goalDifference + normalized.goalDifference,
      goalsFor: current.goalsFor + normalized.goalsFor,
      leagueTitles: current.leagueTitles + titles,
      gamesPlayed: current.gamesPlayed + normalized.gamesPlayed,
      finalPosition: positions.length > 0 ? Math.min(...positions) : null,
      opponentStrength: Math.round(
        (current.opponentStrength * current.recordCount + normalized.opponentStrength) / nextCount
      ),
      completedAt: latestRecord.completedAt,
      recordCount: nextCount,
      miniLeagueTitles: current.miniLeagueTitles + (mode === "minileague" ? titles : 0),
      invincibleTitles: current.invincibleTitles + (mode === "invincible" ? titles : 0)
    });
  });

  const periodRows: Omit<LeaderboardEntry, "rank">[] = Array.from(userRows.values()).map((row) => ({
    id: row.id,
    userId: row.userId,
    displayName: row.displayName,
    kind: row.kind,
    competitionMode: row.competitionMode,
    runId: row.runId,
    gamesPlayed: row.gamesPlayed,
    finalPosition: row.finalPosition,
    periodAt: row.periodAt,
    matchPoints: row.matchPoints,
    goalDifference: row.goalDifference,
    goalsFor: row.goalsFor,
    leagueTitles: row.leagueTitles,
    opponentStrength: row.opponentStrength,
    completedAt: row.completedAt,
    runsCompleted: row.recordCount,
    miniLeagueTitles: row.miniLeagueTitles,
    invincibleTitles: row.invincibleTitles
  }));

  periodRows.sort((first, second) => {
    const titleOrder = second.leagueTitles - first.leagueTitles;
    if (metric === "titles") {
      return (
        titleOrder ||
        Date.parse(first.completedAt) - Date.parse(second.completedAt) ||
        first.displayName.localeCompare(second.displayName)
      );
    }
    return (
      second.matchPoints - first.matchPoints ||
      second.goalDifference - first.goalDifference ||
      second.goalsFor - first.goalsFor ||
      titleOrder ||
      second.opponentStrength - first.opponentStrength ||
      Date.parse(first.completedAt) - Date.parse(second.completedAt)
    );
  });

  return periodRows.map((record, index) => ({ ...record, rank: index + 1 }));
}

// Returns no records: cross-user leaderboard data now comes from Supabase.
// Kept so client call sites retain a stable signature.
export function demoLeaderboardRecords(): LeaderboardRecord[] {
  return [];
}

export function recordsFromLeague(params: {
  managers: ManagerSquad[];
  standings: Standing[];
  completedAt: string;
  competitionMode?: CompetitionMode;
  /** Stable season/league identifier. Pass this through retries unchanged. */
  runId?: string;
}): LeaderboardRecord[] {
  const competitionMode = params.competitionMode ?? "minileague";
  const runId = params.runId?.trim() || `${competitionMode}:${params.completedAt}`;
  const championId = params.standings[0]?.managerId;
  const strengthByManager = new Map(params.managers.map((manager) => [manager.id, manager.mmr]));
  const positionByManager = new Map(params.standings.map((standing, index) => [standing.managerId, index + 1]));

  return params.standings
    .filter((standing) => standing.kind === "human")
    .map((standing) => ({
      id: `${standing.managerId}-${runId}`,
      userId: standing.managerId,
      displayName: standing.displayName,
      kind: standing.kind,
      competitionMode,
      runId,
      gamesPlayed: standing.played,
      finalPosition: positionByManager.get(standing.managerId) ?? null,
      periodAt: params.completedAt,
      matchPoints: standing.points,
      goalDifference: standing.goalDifference,
      goalsFor: standing.goalsFor,
      leagueTitles: championId === standing.managerId ? 1 : 0,
      opponentStrength: Math.round(
        params.managers
          .filter((manager) => manager.id !== standing.managerId)
          .reduce((sum, manager) => sum + (strengthByManager.get(manager.id) ?? 0), 0) /
          Math.max(1, params.managers.length - 1)
      ),
      completedAt: params.completedAt
    }));
}
