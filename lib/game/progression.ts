import type { Standing } from "./types";

export const STARTING_MANAGER_SCORE = 65;
export const MIN_MANAGER_SCORE = 30;
export const MAX_MANAGER_SCORE = 100;
export const EXPERT_SCORE_THRESHOLD = 80;

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
  // Small per-league movements on the 0–100 scale: a title-winning run ≈ +8, a poor one ≈ -5.
  const pointsScore = (standing.points - 7) * 0.45;
  const goalDifferenceScore = Math.max(-2, Math.min(2, Math.round(standing.goalDifference * 0.3)));
  const goalsForScore = Math.min(2, Math.floor(standing.goalsFor / 4));
  return Math.round(pointsScore + goalDifferenceScore + goalsForScore + (wonTitle ? 2 : 0));
}
