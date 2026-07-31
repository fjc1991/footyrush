import { normalizeCareerRecords } from "./career";
import type {
  ClubEntitlement,
  ClubEntitlementGrant
} from "./club-identity";
import type { LeaderboardRecord } from "./types";

export type AchievementId = "first_campaign" | "goal_getter" | "club_established";
export type AchievementMetric = "completed_runs" | "career_goals";

export interface AchievementDefinition {
  id: AchievementId;
  title: string;
  description: string;
  metric: AchievementMetric;
  target: number;
  reward: ClubEntitlement;
  rewardLabel: string;
}

export interface AchievementProgress extends AchievementDefinition {
  current: number;
  remaining: number;
  progressPercent: number;
  completed: boolean;
}

export const ACHIEVEMENT_CATALOG: readonly AchievementDefinition[] = Object.freeze([
  {
    id: "first_campaign",
    title: "First Campaign",
    description: "Complete your first Mini League or Invincible campaign.",
    metric: "completed_runs",
    target: 1,
    reward: "club_name_custom",
    rewardLabel: "Custom club name"
  },
  {
    id: "goal_getter",
    title: "Goal Getter",
    description: "Score 10 goals across completed campaigns.",
    metric: "career_goals",
    target: 10,
    reward: "kit_palette_basic",
    rewardLabel: "Club colour palettes"
  },
  {
    id: "club_established",
    title: "Club Established",
    description: "Complete three Mini League or Invincible campaigns.",
    metric: "completed_runs",
    target: 3,
    reward: "kit_style_basic",
    rewardLabel: "Kit patterns"
  }
]);

export interface AchievementTotals {
  completedRuns: number;
  careerGoals: number;
}

/**
 * Completed human records are normalized first, so retries, legacy data and
 * malformed totals cannot inflate achievement progress.
 */
export function achievementTotals(records: readonly LeaderboardRecord[]): AchievementTotals {
  const normalized = normalizeCareerRecords(records);
  return {
    completedRuns: normalized.length,
    careerGoals: normalized.reduce(
      (total, record) => total + Math.min(record.competitionMode === "invincible" ? 300 : 100, record.goalsFor),
      0
    )
  };
}

function metricValue(metric: AchievementMetric, totals: AchievementTotals): number {
  return metric === "career_goals" ? totals.careerGoals : totals.completedRuns;
}

export function achievementProgress(
  records: readonly LeaderboardRecord[]
): AchievementProgress[] {
  const totals = achievementTotals(records);
  return ACHIEVEMENT_CATALOG.map((achievement) => {
    const current = metricValue(achievement.metric, totals);
    const completed = current >= achievement.target;
    return {
      ...achievement,
      current,
      remaining: Math.max(0, achievement.target - current),
      progressPercent: Math.max(0, Math.min(100, Math.round((current / achievement.target) * 100))),
      completed
    };
  });
}

/** Achievement rewards expressed in the same source-neutral grant model as future purchases. */
export function achievementEntitlementGrants(
  records: readonly LeaderboardRecord[]
): ClubEntitlementGrant[] {
  return achievementProgress(records)
    .filter((achievement) => achievement.completed)
    .map((achievement) => ({
      entitlement: achievement.reward,
      source: "achievement",
      sourceRef: achievement.id
    }));
}

export function achievementById(id: AchievementId): AchievementDefinition {
  const achievement = ACHIEVEMENT_CATALOG.find((candidate) => candidate.id === id);
  if (!achievement) throw new Error(`Unknown achievement: ${id}`);
  return achievement;
}
