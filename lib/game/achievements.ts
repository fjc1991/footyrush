import { normalizeCareerRecords } from "./career";
import type {
  ClubEntitlement,
  ClubEntitlementGrant
} from "./club-identity";
import type { LeaderboardRecord } from "./types";

export type UnlockId =
  | "club_identity"
  | "club_colours"
  | "kit_designer"
  | "badge_heritage";

export type UnlockMetric =
  | "completed_runs"
  | "career_goals"
  | "career_points"
  | "league_titles";

type GameplayUnlockEntitlement = Exclude<ClubEntitlement, "supporter_edition">;

export interface UnlockDefinition {
  id: UnlockId;
  pathLabel: string;
  title: string;
  description: string;
  metric: UnlockMetric;
  target: number;
  unitSingular: string;
  unitPlural: string;
  reward: GameplayUnlockEntitlement;
  rewardLabel: string;
}

export interface UnlockProgress extends UnlockDefinition {
  current: number;
  remaining: number;
  /** A display-safe percentage that never reaches 100 before the target is met. */
  progressPercent: number;
  completed: boolean;
}

/**
 * Personalization is intentionally a set of long-term, independent paths.
 * Each reward uses a different durable career metric, so one strong run cannot
 * open the entire customizer at once.
 */
export const UNLOCK_CATALOG: readonly UnlockDefinition[] = Object.freeze([
  {
    id: "club_identity",
    pathLabel: "Identity path",
    title: "Name your club",
    description: "Build a lasting managerial history across either competition.",
    metric: "completed_runs",
    target: 50,
    unitSingular: "completed campaign",
    unitPlural: "completed campaigns",
    reward: "club_name_custom",
    rewardLabel: "Custom club name"
  },
  {
    id: "club_colours",
    pathLabel: "Scoring path",
    title: "Choose your colours",
    description: "Every goal in a completed campaign moves your visual identity forward.",
    metric: "career_goals",
    target: 500,
    unitSingular: "career goal",
    unitPlural: "career goals",
    reward: "kit_palette_basic",
    rewardLabel: "Club colour palettes"
  },
  {
    id: "kit_designer",
    pathLabel: "Performance path",
    title: "Design your kit",
    description: "Bank points over time in Mini League and Be Invincible campaigns.",
    metric: "career_points",
    target: 2_500,
    unitSingular: "career point",
    unitPlural: "career points",
    reward: "kit_style_basic",
    rewardLabel: "Kit patterns"
  },
  {
    id: "badge_heritage",
    pathLabel: "Champion path",
    title: "Shape your badge",
    description: "Only competition titles count toward the final piece of your club identity.",
    metric: "league_titles",
    target: 100,
    unitSingular: "league title",
    unitPlural: "league titles",
    reward: "badge_style_basic",
    rewardLabel: "Badge shapes"
  }
]);

export interface UnlockTotals {
  completedRuns: number;
  careerGoals: number;
  careerPoints: number;
  leagueTitles: number;
}

/**
 * Completed human records are normalized first, so retries, reserve rows and
 * malformed totals cannot inflate unlock progress.
 */
export function unlockTotals(records: readonly LeaderboardRecord[]): UnlockTotals {
  const normalized = normalizeCareerRecords(records);
  return {
    completedRuns: normalized.length,
    careerGoals: normalized.reduce(
      (total, record) => total + Math.min(record.competitionMode === "invincible" ? 300 : 100, record.goalsFor),
      0
    ),
    careerPoints: normalized.reduce((total, record) => total + record.matchPoints, 0),
    leagueTitles: normalized.reduce((total, record) => total + record.leagueTitles, 0)
  };
}

function metricValue(metric: UnlockMetric, totals: UnlockTotals): number {
  switch (metric) {
    case "career_goals":
      return totals.careerGoals;
    case "career_points":
      return totals.careerPoints;
    case "league_titles":
      return totals.leagueTitles;
    default:
      return totals.completedRuns;
  }
}

function boundedProgressPercent(current: number, target: number, completed: boolean): number {
  if (completed) return 100;
  if (target <= 0 || current <= 0) return 0;
  // One decimal keeps a 499/500 path visibly incomplete instead of rounding to 100%.
  return Math.min(99.9, Math.floor((current / target) * 1_000) / 10);
}

export function unlockProgress(records: readonly LeaderboardRecord[]): UnlockProgress[] {
  const totals = unlockTotals(records);
  return UNLOCK_CATALOG.map((unlock) => {
    const current = metricValue(unlock.metric, totals);
    const completed = current >= unlock.target;
    return {
      ...unlock,
      current,
      remaining: Math.max(0, unlock.target - current),
      progressPercent: boundedProgressPercent(current, unlock.target, completed),
      completed
    };
  });
}

/** Earned rewards use the same source-neutral grant model as future supporter purchases. */
export function unlockEntitlementGrants(
  records: readonly LeaderboardRecord[]
): ClubEntitlementGrant[] {
  return unlockProgress(records)
    .filter((unlock) => unlock.completed)
    .map((unlock) => ({
      entitlement: unlock.reward,
      source: "unlock",
      sourceRef: unlock.id
    }));
}

export function unlockById(id: UnlockId): UnlockDefinition {
  const unlock = UNLOCK_CATALOG.find((candidate) => candidate.id === id);
  if (!unlock) throw new Error(`Unknown unlock: ${id}`);
  return unlock;
}

export function unlockForEntitlement(entitlement: ClubEntitlement): UnlockDefinition | null {
  return UNLOCK_CATALOG.find((candidate) => candidate.reward === entitlement) ?? null;
}
