import { createHmac } from "node:crypto";

export const INVINCIBLE_MIN_TARGET = 1000;
export const INVINCIBLE_MAX_TARGET = 100000;
export const INVINCIBLE_MAX_USER_COUNT = 100000;
export const INVINCIBLE_JITTER = 0.12;

export function targetOddsForUserCount(userCount: number): number {
  const users = Math.max(1, Math.min(INVINCIBLE_MAX_USER_COUNT, Math.floor(userCount)));
  const progress = Math.log1p((users - 1) / 1000) / Math.log1p((INVINCIBLE_MAX_USER_COUNT - 1) / 1000);
  return INVINCIBLE_MIN_TARGET + (INVINCIBLE_MAX_TARGET - INVINCIBLE_MIN_TARGET) * progress;
}

function hmacUnit(secret: string, key: string): number {
  const hex = createHmac("sha256", secret).update(key).digest("hex").slice(0, 13);
  return Number.parseInt(hex, 16) / 0x10000000000000;
}

export function jitterMultiplierForAttempt(attemptId: string, secret: string): number {
  const unit = hmacUnit(secret, `jitter:${attemptId}`);
  return 1 - INVINCIBLE_JITTER + unit * INVINCIBLE_JITTER * 2;
}

export function rollForAttempt(attemptId: string, secret: string): number {
  return hmacUnit(secret, `roll:${attemptId}`);
}

export function evaluateInvincibleEligibility(params: {
  attemptId: string;
  userCount: number;
  secret: string;
}): {
  targetOdds: number;
  jitteredTargetOdds: number;
  jitterMultiplier: number;
  roll: number;
  eligible: boolean;
} {
  const targetOdds = targetOddsForUserCount(params.userCount);
  const jitterMultiplier = jitterMultiplierForAttempt(params.attemptId, params.secret);
  const jitteredTargetOdds = targetOdds * jitterMultiplier;
  const roll = rollForAttempt(params.attemptId, params.secret);
  return {
    targetOdds,
    jitteredTargetOdds,
    jitterMultiplier,
    roll,
    eligible: roll < 1 / jitteredTargetOdds
  };
}

export function officialInvincibleAward(eligible: boolean, unbeaten: boolean): boolean {
  return eligible && unbeaten;
}
