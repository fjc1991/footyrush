import type { CompetitionMode, LeaderboardRecord } from "./types";

export interface CareerModeSummary {
  runs: number;
  titles: number;
  totalPoints: number;
  bestPoints: number | null;
}

export interface CareerSummary {
  totalRuns: number;
  totalTitles: number;
  miniLeague: CareerModeSummary;
  invincible: CareerModeSummary;
}

export type CareerMilestoneMetric = "runs" | "titles" | "best_points";
export type CareerMilestoneMode = CompetitionMode | "all";

export interface CareerMilestone {
  id:
    | "career_runs"
    | "minileague_runs"
    | "minileague_titles"
    | "minileague_best_points"
    | "invincible_runs"
    | "invincible_titles"
    | "invincible_best_points";
  mode: CareerMilestoneMode;
  metric: CareerMilestoneMetric;
  label: string;
  detail: string;
  current: number;
  target: number;
  remaining: number;
  progressPercent: number;
}

const RUN_TIERS = [1, 3, 5, 10, 25, 50, 100] as const;
const TITLE_TIERS = [1, 3, 5, 10, 25, 50] as const;
const MINI_BEST_POINT_TIERS = [5, 8, 10, 12, 15] as const;
const INVINCIBLE_BEST_POINT_TIERS = [40, 60, 75, 90, 100, 114] as const;

function emptyModeSummary(): CareerModeSummary {
  return { runs: 0, titles: 0, totalPoints: 0, bestPoints: null };
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
}

function finiteInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : 0;
}

function validDate(value: unknown, fallback: string): string {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? value
    : fallback;
}

function competitionModeOf(record: LeaderboardRecord): CompetitionMode {
  // Old cached records predate competitionMode and represent Mini Leagues.
  return record.competitionMode === "invincible" ? "invincible" : "minileague";
}

function completedRunKey(record: LeaderboardRecord, index: number): string {
  const mode = competitionModeOf(record);
  const runId = typeof record.runId === "string" && record.runId.trim()
    ? record.runId.trim()
    : typeof record.id === "string" && record.id.trim()
      ? record.id.trim()
      : `uncached-${index}`;
  return `${mode}:${runId}`;
}

/**
 * Return the canonical personal records used by every career surface. Besides
 * removing completion retries, this protects My Home from old or damaged local
 * caches that contain NaN totals, impossible points, or oversized title counts.
 */
export function normalizeCareerRecords(
  records: readonly LeaderboardRecord[]
): LeaderboardRecord[] {
  const uniqueRuns = new Map<string, LeaderboardRecord>();
  records.forEach((record, index) => {
    if (!record || record.kind !== "human") return;
    const mode = competitionModeOf(record);
    const runId = typeof record.runId === "string" && record.runId.trim()
      ? record.runId.trim()
      : typeof record.id === "string" && record.id.trim()
        ? record.id.trim()
        : `uncached-${index}`;
    const fallbackDate = "1970-01-01T00:00:00.000Z";
    const completedAt = validDate(record.completedAt, validDate(record.periodAt, fallbackDate));
    const periodAt = validDate(record.periodAt, completedAt);
    const maximumPoints = mode === "invincible" ? 114 : 15;
    const maximumGames = mode === "invincible" ? 38 : 5;
    const finalPosition = nonNegativeInteger(record.finalPosition);

    uniqueRuns.set(completedRunKey(record, index), {
      ...record,
      id: typeof record.id === "string" && record.id.trim() ? record.id.trim() : runId,
      competitionMode: mode,
      runId,
      gamesPlayed: Math.min(maximumGames, nonNegativeInteger(record.gamesPlayed)),
      finalPosition: finalPosition > 0 ? finalPosition : null,
      periodAt,
      matchPoints: Math.min(maximumPoints, nonNegativeInteger(record.matchPoints)),
      goalDifference: finiteInteger(record.goalDifference),
      goalsFor: nonNegativeInteger(record.goalsFor),
      leagueTitles: Math.min(1, nonNegativeInteger(record.leagueTitles)),
      opponentStrength: nonNegativeInteger(record.opponentStrength),
      completedAt
    });
  });
  return Array.from(uniqueRuns.values());
}

/**
 * Summarize one manager's completed-run records into durable career totals.
 *
 * Runtime guards intentionally tolerate pre-migration or malformed browser
 * caches. Duplicate completion retries are counted once per mode/run id, and
 * non-human rows are ignored if a caller accidentally passes a mixed board.
 */
export function summarizeCareer(records: readonly LeaderboardRecord[]): CareerSummary {
  const summary: CareerSummary = {
    totalRuns: 0,
    totalTitles: 0,
    miniLeague: emptyModeSummary(),
    invincible: emptyModeSummary()
  };

  normalizeCareerRecords(records).forEach((record) => {
    const mode = competitionModeOf(record);
    const modeSummary = mode === "invincible" ? summary.invincible : summary.miniLeague;
    const points = nonNegativeInteger(record.matchPoints);
    // A single completed competition can award at most one league title.
    const titles = Math.min(1, nonNegativeInteger(record.leagueTitles));

    modeSummary.runs += 1;
    modeSummary.titles += titles;
    modeSummary.totalPoints += points;
    modeSummary.bestPoints = modeSummary.bestPoints === null
      ? points
      : Math.max(modeSummary.bestPoints, points);
  });

  summary.totalRuns = summary.miniLeague.runs + summary.invincible.runs;
  summary.totalTitles = summary.miniLeague.titles + summary.invincible.titles;
  return summary;
}

function nextOpenTier(current: number, tiers: readonly number[], extensionStep: number): number {
  const tier = tiers.find((target) => target > current);
  if (tier !== undefined) return tier;

  const lastTier = tiers.at(-1) ?? extensionStep;
  const tiersPastLast = Math.floor((current - lastTier) / extensionStep) + 1;
  return lastTier + Math.max(1, tiersPastLast) * extensionStep;
}

function milestone(params: Omit<CareerMilestone, "remaining" | "progressPercent">): CareerMilestone {
  const current = nonNegativeInteger(params.current);
  const target = Math.max(current + 1, nonNegativeInteger(params.target));
  return {
    ...params,
    current,
    target,
    remaining: target - current,
    progressPercent: Math.max(0, Math.min(100, Math.round((current / target) * 100)))
  };
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

/**
 * Return the next attainable target for each career track. Run and title tiers
 * continue at regular intervals after the named early landmarks, so a veteran
 * manager never reaches a dead end. Best-points tracks stop at the competition's
 * real maximum rather than advertising an impossible score.
 */
export function nextCareerMilestones(summary: CareerSummary): CareerMilestone[] {
  const milestones: CareerMilestone[] = [];
  const totalRunTarget = nextOpenTier(summary.totalRuns, RUN_TIERS, 50);
  const miniRunTarget = nextOpenTier(summary.miniLeague.runs, RUN_TIERS, 50);
  const miniTitleTarget = nextOpenTier(summary.miniLeague.titles, TITLE_TIERS, 25);
  const invincibleRunTarget = nextOpenTier(summary.invincible.runs, RUN_TIERS, 50);
  const invincibleTitleTarget = nextOpenTier(summary.invincible.titles, TITLE_TIERS, 25);

  milestones.push(milestone({
    id: "career_runs",
    mode: "all",
    metric: "runs",
    label: "Career campaigns",
    detail: `Complete ${totalRunTarget} ${plural(totalRunTarget, "run")} across both modes.`,
    current: summary.totalRuns,
    target: totalRunTarget
  }));

  const miniBest = summary.miniLeague.bestPoints ?? 0;
  const miniBestTarget = MINI_BEST_POINT_TIERS.find((target) => target > miniBest);
  if (miniBestTarget !== undefined) {
    milestones.push(milestone({
      id: "minileague_best_points",
      mode: "minileague",
      metric: "best_points",
      label: "Mini League personal best",
      detail: `Reach ${miniBestTarget} points in one Mini League.`,
      current: miniBest,
      target: miniBestTarget
    }));
  }

  milestones.push(
    milestone({
      id: "minileague_runs",
      mode: "minileague",
      metric: "runs",
      label: "Mini League regular",
      detail: `Complete ${miniRunTarget} Mini ${plural(miniRunTarget, "League")}.`,
      current: summary.miniLeague.runs,
      target: miniRunTarget
    }),
    milestone({
      id: "minileague_titles",
      mode: "minileague",
      metric: "titles",
      label: "Mini League champion",
      detail: `Win ${miniTitleTarget} Mini League ${plural(miniTitleTarget, "title")}.`,
      current: summary.miniLeague.titles,
      target: miniTitleTarget
    })
  );

  const invincibleBest = summary.invincible.bestPoints ?? 0;
  const invincibleBestTarget = INVINCIBLE_BEST_POINT_TIERS.find((target) => target > invincibleBest);
  if (invincibleBestTarget !== undefined) {
    milestones.push(milestone({
      id: "invincible_best_points",
      mode: "invincible",
      metric: "best_points",
      label: "Invincible personal best",
      detail: `Reach ${invincibleBestTarget} points in one Invincible season.`,
      current: invincibleBest,
      target: invincibleBestTarget
    }));
  }

  milestones.push(
    milestone({
      id: "invincible_runs",
      mode: "invincible",
      metric: "runs",
      label: "Invincible campaigner",
      detail: `Complete ${invincibleRunTarget} Invincible ${plural(invincibleRunTarget, "season")}.`,
      current: summary.invincible.runs,
      target: invincibleRunTarget
    }),
    milestone({
      id: "invincible_titles",
      mode: "invincible",
      metric: "titles",
      label: "Invincible league titles",
      detail: `Win ${invincibleTitleTarget} Invincible league ${plural(invincibleTitleTarget, "title")}.`,
      current: summary.invincible.titles,
      target: invincibleTitleTarget
    })
  );

  return milestones;
}

export function nextCareerMilestonesForMode(
  summary: CareerSummary,
  mode: CompetitionMode
): CareerMilestone[] {
  return nextCareerMilestones(summary).filter(
    (candidate) => candidate.mode === "all" || candidate.mode === mode
  );
}
