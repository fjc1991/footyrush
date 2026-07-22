export const INVINCIBLE_AUTOPLAY_SECONDS = 3;

export type InvincibleAttentionReason = "replacement" | "out_of_form" | null;

export type InvincibleAutoplayStatus =
  | "running"
  | "paused"
  | "attention"
  | "saving"
  | "failed"
  | "complete";

export function invincibleAutoplayTimerKey(seasonId: string, matchday: number): string {
  return `${seasonId}:${matchday}`;
}

export function getInvincibleAttentionReason(params: {
  missingReplacementCount: number;
  hasOutOfFormDecision: boolean;
  outOfFormChoice: "keep" | "bench" | null;
  outOfFormSubstituteId: number | null;
}): InvincibleAttentionReason {
  if (params.missingReplacementCount > 0) {
    return "replacement";
  }
  if (
    params.hasOutOfFormDecision &&
    (!params.outOfFormChoice || (params.outOfFormChoice === "bench" && params.outOfFormSubstituteId === null))
  ) {
    return "out_of_form";
  }
  return null;
}

export function getInvincibleAutoplayStatus(params: {
  complete: boolean;
  hasNextMatch: boolean;
  paused: boolean;
  attentionReason: InvincibleAttentionReason;
  pending: boolean;
  error: string;
}): InvincibleAutoplayStatus {
  if (params.complete) {
    return "complete";
  }
  if (params.error) {
    return "failed";
  }
  if (params.pending) {
    return "saving";
  }
  if (params.attentionReason) {
    return "attention";
  }
  if (params.paused) {
    return "paused";
  }
  if (!params.hasNextMatch) {
    return "complete";
  }
  return "running";
}

interface CountdownOptions {
  seconds?: number;
  onTick: (secondsRemaining: number) => void;
  onElapsed: () => void;
}

/**
 * Schedules the between-match countdown and returns an idempotent cleanup.
 * Keeping the scheduler independent from React makes its exactly-once and
 * cancellation behaviour straightforward to exercise with fake timers.
 */
export function scheduleInvincibleCountdown({
  seconds = INVINCIBLE_AUTOPLAY_SECONDS,
  onTick,
  onElapsed
}: CountdownOptions): () => void {
  let cancelled = false;
  let remaining = Math.max(0, Math.floor(seconds));
  let timer: ReturnType<typeof globalThis.setTimeout> | null = null;

  onTick(remaining);

  const tick = () => {
    if (cancelled) {
      return;
    }
    remaining = Math.max(0, remaining - 1);
    onTick(remaining);
    if (remaining === 0) {
      cancelled = true;
      onElapsed();
      return;
    }
    timer = globalThis.setTimeout(tick, 1000);
  };

  if (remaining === 0) {
    cancelled = true;
    onElapsed();
  } else {
    timer = globalThis.setTimeout(tick, 1000);
  }

  return () => {
    if (cancelled) {
      return;
    }
    cancelled = true;
    if (timer !== null) {
      globalThis.clearTimeout(timer);
    }
  };
}
