import type { Standing } from "./types";

export const STARTING_MANAGER_SCORE = 0;
export const MIN_MANAGER_SCORE = 0;
export const EXPERT_SCORE_THRESHOLD = 1000;
export const CAREER_DIFFICULTY_SCORE_PER_RUN = 30;
export const CAREER_DIFFICULTY_RUN_FLOOR_CAP = 600;
export const CAREER_DIFFICULTY_SCORE_PER_TITLE = 90;

export function isExpertUnlocked(score: number): boolean {
  return score >= EXPERT_SCORE_THRESHOLD;
}

export function hasExpertAccess(score: number, previouslyUnlocked: boolean): boolean {
  return previouslyUnlocked || isExpertUnlocked(score);
}

export function expertProgress(score: number): number {
  const progress = ((score - STARTING_MANAGER_SCORE) / (EXPERT_SCORE_THRESHOLD - STARTING_MANAGER_SCORE)) * 100;
  return Math.max(0, Math.min(100, Math.round(progress)));
}

/**
 * Invincible seasons do not use the short-format manager-score delta, so career
 * volume supplies a floor for matchmaking. Ten completed campaigns reach
 * Silver and twenty reach Gold. Titles provide the performance path through
 * every band, so ten career titles reach Elite while persistence alone never
 * pushes a struggling player into the hardest level.
 */
export function careerMatchmakingScore(
  managerScore: number,
  completedRuns: number,
  careerTitles = 0
): number {
  const score = Number.isFinite(managerScore) ? Math.round(managerScore) : MIN_MANAGER_SCORE;
  const runs = Number.isFinite(completedRuns) ? Math.max(0, Math.floor(completedRuns)) : 0;
  const titles = Number.isFinite(careerTitles) ? Math.max(0, Math.floor(careerTitles)) : 0;
  const careerFloor = Math.min(
    CAREER_DIFFICULTY_RUN_FLOOR_CAP,
    runs * CAREER_DIFFICULTY_SCORE_PER_RUN
  );
  const performanceFloor = Math.min(900, titles * CAREER_DIFFICULTY_SCORE_PER_TITLE);
  return Math.max(MIN_MANAGER_SCORE, score, careerFloor, performanceFloor);
}

export function scoreDeltaForStanding(standing: Pick<Standing, "points" | "goalDifference" | "goalsFor">, wonTitle: boolean): number {
  // Points accumulate toward the 1000 expert milestone: a title-winning run ≈ +38, a poor one ≈ -10.
  const pointsScore = standing.points * 3 - 14;
  const goalDifferenceScore = Math.max(-8, Math.min(8, standing.goalDifference));
  const goalsForScore = Math.min(5, Math.floor(standing.goalsFor / 2));
  return pointsScore + goalDifferenceScore + goalsForScore + (wonTitle ? 10 : 0);
}
