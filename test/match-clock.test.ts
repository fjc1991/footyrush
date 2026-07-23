import { describe, expect, it } from "vitest";
import {
  MATCH_DURATION_MS,
  advanceMatchProgress,
  matchMinuteFromProgress
} from "@/lib/game/match-clock";

describe("elapsed-time match clock", () => {
  it("finishes at 30, 15 and 8 seconds", () => {
    expect(advanceMatchProgress(0, 30_000, 1)).toBe(1);
    expect(advanceMatchProgress(0, 15_000, 2)).toBe(1);
    expect(advanceMatchProgress(0, 8_000, 4)).toBe(1);
    expect(MATCH_DURATION_MS).toEqual({ 1: 30_000, 2: 15_000, 4: 8_000 });
  });

  it("preserves accumulated progress across speed changes", () => {
    const firstHalf = advanceMatchProgress(0, 15_000, 1);
    const complete = advanceMatchProgress(firstHalf, 7_500, 2);
    expect(firstHalf).toBe(0.5);
    expect(complete).toBe(1);
  });

  it("clamps the broadcast minute and never runs past full time", () => {
    expect(matchMinuteFromProgress(0)).toBe(0);
    expect(matchMinuteFromProgress(0.5)).toBe(45);
    expect(matchMinuteFromProgress(4)).toBe(90);
  });
});
