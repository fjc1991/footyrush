import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getInvincibleAttentionReason,
  getInvincibleAutoplayStatus,
  invincibleAutoplayTimerKey,
  scheduleInvincibleCountdown
} from "@/lib/game/invincible-autoplay";

afterEach(() => {
  vi.useRealTimers();
});

describe("Invincible autoplay", () => {
  it("uses the season and matchday as the countdown identity", () => {
    expect(invincibleAutoplayTimerKey("season-7", 0)).toBe("season-7:0");
    expect(invincibleAutoplayTimerKey("season-7", 1)).toBe("season-7:1");
  });

  it("only asks for attention for unresolved mandatory decisions", () => {
    expect(
      getInvincibleAttentionReason({
        missingReplacementCount: 1,
        hasOutOfFormDecision: false,
        outOfFormChoice: null,
        outOfFormSubstituteId: null
      })
    ).toBe("replacement");
    expect(
      getInvincibleAttentionReason({
        missingReplacementCount: 0,
        hasOutOfFormDecision: true,
        outOfFormChoice: null,
        outOfFormSubstituteId: null
      })
    ).toBe("out_of_form");
    expect(
      getInvincibleAttentionReason({
        missingReplacementCount: 0,
        hasOutOfFormDecision: true,
        outOfFormChoice: "bench",
        outOfFormSubstituteId: null
      })
    ).toBe("out_of_form");
    expect(
      getInvincibleAttentionReason({
        missingReplacementCount: 0,
        hasOutOfFormDecision: true,
        outOfFormChoice: "bench",
        outOfFormSubstituteId: 42
      })
    ).toBeNull();
    expect(
      getInvincibleAttentionReason({
        missingReplacementCount: 0,
        hasOutOfFormDecision: false,
        outOfFormChoice: null,
        outOfFormSubstituteId: null
      })
    ).toBeNull();
  });

  it("prioritizes terminal, failure, saving, and attention states", () => {
    const base = {
      complete: false,
      hasNextMatch: true,
      paused: false,
      attentionReason: null,
      pending: false,
      error: ""
    } as const;

    expect(getInvincibleAutoplayStatus(base)).toBe("running");
    expect(getInvincibleAutoplayStatus({ ...base, paused: true })).toBe("paused");
    expect(getInvincibleAutoplayStatus({ ...base, paused: true, attentionReason: "replacement" })).toBe("attention");
    expect(getInvincibleAutoplayStatus({ ...base, pending: true, error: "network" })).toBe("failed");
    expect(getInvincibleAutoplayStatus({ ...base, complete: true, error: "network" })).toBe("complete");
  });

  it("ticks visibly and elapses exactly once after three seconds", () => {
    vi.useFakeTimers();
    const ticks: number[] = [];
    const elapsed = vi.fn();

    scheduleInvincibleCountdown({ onTick: (value) => ticks.push(value), onElapsed: elapsed });
    expect(ticks).toEqual([3]);

    vi.advanceTimersByTime(2999);
    expect(ticks).toEqual([3, 2, 1]);
    expect(elapsed).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(ticks).toEqual([3, 2, 1, 0]);
    expect(elapsed).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5000);
    expect(elapsed).toHaveBeenCalledTimes(1);
  });

  it("cancels without advancing and cleanup is idempotent", () => {
    vi.useFakeTimers();
    const elapsed = vi.fn();
    const cancel = scheduleInvincibleCountdown({ onTick: () => undefined, onElapsed: elapsed });

    vi.advanceTimersByTime(1000);
    cancel();
    cancel();
    vi.advanceTimersByTime(5000);

    expect(elapsed).not.toHaveBeenCalled();
  });
});
