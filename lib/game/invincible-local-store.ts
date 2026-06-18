export interface LocalInvincibleAttempt {
  id: string;
  participantKey: string;
  attemptNumber: number;
  userCountSnapshot: number;
  targetOddsSnapshot: number;
  eligible: boolean;
  startedAt: string;
  completedAt?: string;
  unbeaten?: boolean;
  officialAward?: boolean;
}

interface LocalInvincibleStore {
  attempts: Map<string, LocalInvincibleAttempt>;
  participants: Set<string>;
}

const globalStore = globalThis as typeof globalThis & {
  __footyRushInvincibleStore?: LocalInvincibleStore;
};

export function getLocalInvincibleStore(): LocalInvincibleStore {
  if (!globalStore.__footyRushInvincibleStore) {
    globalStore.__footyRushInvincibleStore = {
      attempts: new Map(),
      participants: new Set()
    };
  }
  return globalStore.__footyRushInvincibleStore;
}
