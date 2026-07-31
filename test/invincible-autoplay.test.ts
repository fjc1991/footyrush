import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getInvincibleAttentionReason,
  getInvincibleAutoplayStatus,
  invincibleAutoplayTimerKey,
  scheduleInvincibleCountdown,
  shouldPauseAfterInvincibleResult
} from "@/lib/game/invincible-autoplay";
import type { FixtureResult } from "@/lib/game/types";

function result(overrides: Partial<FixtureResult> = {}): FixtureResult {
  return {
    fixtureId: "fixture",
    round: 1,
    homeId: "human",
    awayId: "opponent",
    homeGoals: 1,
    awayGoals: 0,
    events: [],
    homeInjuries: [],
    awayInjuries: [],
    homeRedCards: [],
    awayRedCards: [],
    playedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

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

  it("keeps the countdown stopped while a completed match is being presented", () => {
    const base = {
      complete: false,
      hasNextMatch: true,
      paused: false,
      attentionReason: null,
      pending: false,
      presenting: true,
      error: ""
    } as const;

    expect(getInvincibleAutoplayStatus(base)).toBe("presenting");
    expect(getInvincibleAutoplayStatus({ ...base, hasNextMatch: false })).toBe("presenting");
    expect(
      getInvincibleAutoplayStatus({
        ...base,
        paused: true,
        attentionReason: "replacement"
      })
    ).toBe("presenting");
  });

  it("keeps terminal, failure, and saving states ahead of presentation", () => {
    const presenting = {
      complete: false,
      hasNextMatch: true,
      paused: false,
      attentionReason: null,
      pending: false,
      presenting: true,
      error: ""
    } as const;

    expect(getInvincibleAutoplayStatus({ ...presenting, pending: true })).toBe("saving");
    expect(getInvincibleAutoplayStatus({ ...presenting, error: "network" })).toBe("failed");
    expect(getInvincibleAutoplayStatus({ ...presenting, complete: true })).toBe("complete");
  });

  it("keeps routine results and losses moving, but pauses for human casualties", () => {
    const win = result({ fixtureId: "win", homeGoals: 2, awayGoals: 0 });
    const draw = result({ fixtureId: "draw", homeGoals: 1, awayGoals: 1 });
    const firstLoss = result({ fixtureId: "first-loss", homeGoals: 0, awayGoals: 1 });
    const laterLoss = result({ fixtureId: "later-loss", homeGoals: 1, awayGoals: 3 });
    const injuryWin = result({ fixtureId: "injury", homeInjuries: [42] });
    const awayRed = result({
      fixtureId: "away-red",
      homeId: "opponent",
      awayId: "human",
      awayRedCards: [7]
    });

    expect(shouldPauseAfterInvincibleResult({ previousResults: [], result: win })).toBe(false);
    expect(shouldPauseAfterInvincibleResult({ previousResults: [win], result: draw })).toBe(false);
    expect(shouldPauseAfterInvincibleResult({ previousResults: [win], result: firstLoss })).toBe(false);
    expect(shouldPauseAfterInvincibleResult({ previousResults: [firstLoss], result: laterLoss })).toBe(false);
    expect(shouldPauseAfterInvincibleResult({ previousResults: [firstLoss], result: injuryWin })).toBe(true);
    expect(shouldPauseAfterInvincibleResult({ previousResults: [win], result: awayRed })).toBe(true);
  });

  it("only pauses for casualties suffered by a human starter when the active XI is supplied", () => {
    const benchInjury = result({ fixtureId: "bench-injury", homeInjuries: [42] });
    const starterRed = result({ fixtureId: "starter-red", homeRedCards: [7] });
    const awayStarterInjury = result({
      fixtureId: "away-starter-injury",
      homeId: "opponent",
      awayId: "human",
      awayInjuries: [9]
    });
    const opponentCasualty = result({
      fixtureId: "opponent-casualty",
      homeId: "opponent-a",
      awayId: "opponent-b",
      homeInjuries: [7]
    });

    expect(
      shouldPauseAfterInvincibleResult({
        previousResults: [],
        result: benchInjury,
        humanStarterPlayerIds: [7, 9]
      })
    ).toBe(false);
    expect(
      shouldPauseAfterInvincibleResult({
        previousResults: [],
        result: starterRed,
        humanStarterPlayerIds: [7, 9]
      })
    ).toBe(true);
    expect(
      shouldPauseAfterInvincibleResult({
        previousResults: [],
        result: awayStarterInjury,
        humanStarterPlayerIds: [7, 9]
      })
    ).toBe(true);
    expect(
      shouldPauseAfterInvincibleResult({
        previousResults: [],
        result: opponentCasualty,
        humanStarterPlayerIds: [7, 9]
      })
    ).toBe(false);
  });

  it("ticks visibly and elapses exactly once after one second by default", () => {
    vi.useFakeTimers();
    const ticks: number[] = [];
    const elapsed = vi.fn();

    scheduleInvincibleCountdown({ onTick: (value) => ticks.push(value), onElapsed: elapsed });
    expect(ticks).toEqual([1]);

    vi.advanceTimersByTime(999);
    expect(ticks).toEqual([1]);
    expect(elapsed).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(ticks).toEqual([1, 0]);
    expect(elapsed).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5000);
    expect(elapsed).toHaveBeenCalledTimes(1);
  });

  it("cancels without advancing and cleanup is idempotent", () => {
    vi.useFakeTimers();
    const elapsed = vi.fn();
    const cancel = scheduleInvincibleCountdown({ seconds: 3, onTick: () => undefined, onElapsed: elapsed });

    vi.advanceTimersByTime(1000);
    cancel();
    cancel();
    vi.advanceTimersByTime(5000);

    expect(elapsed).not.toHaveBeenCalled();
  });
});
