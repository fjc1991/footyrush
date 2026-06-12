import type { Standing } from "./types";

export const STARTING_MANAGER_SCORE = 1000;
export const MIN_MANAGER_SCORE = 700;
export const EXPERT_SCORE_THRESHOLD = 1100;

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

export function scoreDeltaForStanding(standing: Pick<Standing, "points" | "goalDifference" | "goalsFor">, wonTitle: boolean): number {
  const pointsScore = standing.points * 3 - 14;
  const goalDifferenceScore = Math.max(-8, Math.min(8, standing.goalDifference));
  const goalsForScore = Math.min(5, Math.floor(standing.goalsFor / 2));
  return pointsScore + goalDifferenceScore + goalsForScore + (wonTitle ? 10 : 0);
}
