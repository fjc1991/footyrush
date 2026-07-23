export type MilestoneKind =
  | "league_champion"
  | "unbeaten"
  | "expert_unlocked"
  | "run_landmark";

const runLandmarks = new Set([5, 10, 25]);

export function miniLeagueMilestoneKind(params: {
  wonTitle: boolean;
  unlockedExpert: boolean;
  completedLeagues: number;
}): MilestoneKind | null {
  if (params.wonTitle) {
    return "league_champion";
  }
  if (params.unlockedExpert) {
    return "expert_unlocked";
  }
  return runLandmarks.has(params.completedLeagues) ? "run_landmark" : null;
}

export function invincibleMilestoneKind(params: {
  unbeaten: boolean;
  finalPosition: number;
}): MilestoneKind | null {
  if (params.unbeaten) {
    return "unbeaten";
  }
  return params.finalPosition === 1 ? "league_champion" : null;
}
