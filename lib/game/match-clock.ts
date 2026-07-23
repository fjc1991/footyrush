export type MatchSpeed = 1 | 2 | 4;

export const MATCH_MINUTES = 90;

export const MATCH_DURATION_MS: Record<MatchSpeed, number> = {
  1: 30_000,
  2: 15_000,
  4: 8_000
};

export function matchMinuteFromProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(MATCH_MINUTES, Math.max(0, Math.floor(progress * MATCH_MINUTES)));
}

export function advanceMatchProgress(
  progress: number,
  elapsedMs: number,
  speed: MatchSpeed
): number {
  if (!Number.isFinite(progress) || !Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  }
  return Math.min(1, Math.max(0, progress) + elapsedMs / MATCH_DURATION_MS[speed]);
}
