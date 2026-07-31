import type { CompetitionMode, FixtureResult } from "./types";

export const PLAYER_GOAL_MILESTONE_TIERS: Readonly<Record<CompetitionMode, readonly number[]>> = {
  minileague: [1, 3, 5, 8],
  invincible: [5, 10, 20, 30]
};

export interface RunScorer {
  playerId: number | null;
  playerName: string;
  goals: number;
  nextGoalTarget: number | null;
}

export interface PlayerGoalMilestone {
  playerId: number | null;
  playerName: string;
  currentGoals: number;
  targetGoals: number;
  goalsRemaining: number;
}

export interface RunStats {
  mode: CompetitionMode;
  matches: number;
  goalsScored: number;
  cleanSheets: number;
  uniqueScorers: number;
  injuries: number;
  redCards: number;
  impactSubUses: number;
  scorers: RunScorer[];
  topScorer: RunScorer | null;
  nextPlayerGoalMilestone: PlayerGoalMilestone | null;
}

export interface AggregateRunStatsParams {
  mode: CompetitionMode;
  results: readonly FixtureResult[];
  humanTeamId?: string;
}

interface MutableScorer {
  playerId: number | null;
  playerName: string;
  normalizedName: string;
  hasSuppliedName: boolean;
  goals: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizedPlayerId(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function normalizedPlayerName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  return name || null;
}

function nameSortKey(value: string): string {
  return value.toLocaleLowerCase("en-US");
}

function compareNames(first: string, second: string): number {
  const firstKey = nameSortKey(first);
  const secondKey = nameSortKey(second);
  if (firstKey < secondKey) return -1;
  if (firstKey > secondKey) return 1;
  if (first < second) return -1;
  if (first > second) return 1;
  return 0;
}

function scorerIdentity(event: Record<string, unknown>): {
  key: string;
  playerId: number | null;
  playerName: string;
  hasSuppliedName: boolean;
} | null {
  const playerId = normalizedPlayerId(event.playerId);
  const suppliedName = normalizedPlayerName(event.playerName);
  if (playerId === null && suppliedName === null) return null;

  const playerName = suppliedName ?? `Player #${playerId}`;
  return {
    key: playerId === null ? `name:${nameSortKey(playerName)}` : `id:${playerId}`,
    playerId,
    playerName,
    hasSuppliedName: suppliedName !== null
  };
}

function isImpactSub(event: Record<string, unknown>): boolean {
  if (event.code !== "substitution" || !isObject(event.params)) return false;
  const flag = event.params.impactSub;
  return flag === 1 || flag === "1" || flag === true;
}

function usableEvents(result: Record<string, unknown>): Record<string, unknown>[] {
  if (!Array.isArray(result.events)) return [];
  const seenIds = new Set<string>();
  return result.events.flatMap((candidate) => {
    if (!isObject(candidate)) return [];
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    // Generated goal ids can legitimately collide when the same player scores
    // twice in the same simulated second. Preserve every goal event; fixture
    // score generation guarantees each one represents a real goal. Other event
    // types remain id-deduped to keep malformed cached incidents from doubling.
    if (id && candidate.code !== "goal") {
      if (seenIds.has(id)) return [];
      seenIds.add(id);
    }
    return [candidate];
  });
}

function mergeUnambiguousNameOnlyScorers(scorers: Map<string, MutableScorer>): void {
  const nameOnlyEntries = Array.from(scorers.entries()).filter(
    ([, scorer]) => scorer.playerId === null
  );
  nameOnlyEntries.forEach(([nameOnlyKey, nameOnly]) => {
    const identifiedMatches = Array.from(scorers.values()).filter(
      (candidate) =>
        candidate.playerId !== null &&
        candidate.normalizedName === nameOnly.normalizedName
    );
    // A missing id is safe to reconcile only when its normalized display name
    // identifies exactly one known player. Keep an independent row if two real
    // players share the name rather than guessing which one scored.
    if (identifiedMatches.length !== 1) return;
    const identified = identifiedMatches[0];
    identified.goals += nameOnly.goals;
    if (compareNames(nameOnly.playerName, identified.playerName) < 0) {
      identified.playerName = nameOnly.playerName;
      identified.normalizedName = nameSortKey(nameOnly.playerName);
      identified.hasSuppliedName = true;
    }
    scorers.delete(nameOnlyKey);
  });
}

function normalizedScore(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}

function opponentGoalsForCleanSheet(
  result: Record<string, unknown>,
  humanTeamId: string,
  events: readonly Record<string, unknown>[]
): number {
  const humanIsHome = result.homeId === humanTeamId;
  const score = normalizedScore(humanIsHome ? result.awayGoals : result.homeGoals);
  if (score !== null) return score;

  const opponentId = humanIsHome ? result.awayId : result.homeId;
  return events.filter((event) => event.code === "goal" && event.teamId === opponentId).length;
}

export function nextPlayerGoalTarget(mode: CompetitionMode, goals: number): number | null {
  const current = typeof goals === "number" && Number.isFinite(goals)
    ? Math.max(0, Math.round(goals))
    : 0;
  return PLAYER_GOAL_MILESTONE_TIERS[mode].find((target) => target > current) ?? null;
}

/**
 * Aggregate the human manager's matches from a full competition result list.
 * Goal and player totals deliberately come from human-owned goal events, rather
 * than the fixture scoreline, so opponent events can never leak into the scorer
 * table. Scoreline fields are used only to determine clean sheets.
 */
export function aggregateRunStats({
  mode,
  results,
  humanTeamId = "human"
}: AggregateRunStatsParams): RunStats {
  const scorers = new Map<string, MutableScorer>();
  const seenFixtures = new Set<string>();
  let matches = 0;
  let goalsScored = 0;
  let cleanSheets = 0;
  let injuries = 0;
  let redCards = 0;
  let impactSubUses = 0;

  results.forEach((typedResult, resultIndex) => {
    if (!isObject(typedResult)) return;
    const result = typedResult as unknown as Record<string, unknown>;
    const humanIsHome = result.homeId === humanTeamId;
    const humanIsAway = result.awayId === humanTeamId;
    // Malformed self-fixtures and unrelated league fixtures are not human matches.
    if (humanIsHome === humanIsAway) return;

    const fixtureId = typeof result.fixtureId === "string" ? result.fixtureId.trim() : "";
    const fixtureKey = fixtureId || `unkeyed:${resultIndex}`;
    if (seenFixtures.has(fixtureKey)) return;
    seenFixtures.add(fixtureKey);

    matches += 1;
    const events = usableEvents(result);
    if (opponentGoalsForCleanSheet(result, humanTeamId, events) === 0) {
      cleanSheets += 1;
    }

    events.forEach((event) => {
      if (event.teamId !== humanTeamId) return;
      if (event.code === "goal") {
        goalsScored += 1;
        const identity = scorerIdentity(event);
        if (!identity) return;
        const current = scorers.get(identity.key);
        if (!current) {
          scorers.set(identity.key, {
            ...identity,
            normalizedName: nameSortKey(identity.playerName),
            goals: 1
          });
          return;
        }
        current.goals += 1;
        // Prefer a real cached name to the generated id fallback. If two real
        // names disagree, a lexical choice keeps traversal order irrelevant.
        if (
          (identity.hasSuppliedName && !current.hasSuppliedName) ||
          (identity.hasSuppliedName === current.hasSuppliedName &&
            compareNames(identity.playerName, current.playerName) < 0)
        ) {
          current.playerName = identity.playerName;
          current.normalizedName = nameSortKey(identity.playerName);
          current.hasSuppliedName = identity.hasSuppliedName;
        }
      } else if (event.code === "injury") {
        injuries += 1;
      } else if (event.code === "red_card") {
        redCards += 1;
      } else if (isImpactSub(event)) {
        impactSubUses += 1;
      }
    });
  });

  mergeUnambiguousNameOnlyScorers(scorers);

  const scorerLeaderboard: RunScorer[] = Array.from(scorers.values())
    .sort(
      (first, second) =>
        second.goals - first.goals ||
        compareNames(first.playerName, second.playerName) ||
        (first.playerId ?? Number.MAX_SAFE_INTEGER) - (second.playerId ?? Number.MAX_SAFE_INTEGER)
    )
    .map((scorer) => ({
      playerId: scorer.playerId,
      playerName: scorer.playerName,
      goals: scorer.goals,
      nextGoalTarget: nextPlayerGoalTarget(mode, scorer.goals)
    }));

  const nextMilestoneScorer = scorerLeaderboard
    .filter((scorer) => scorer.nextGoalTarget !== null)
    .sort((first, second) => {
      const firstRemaining = (first.nextGoalTarget ?? first.goals) - first.goals;
      const secondRemaining = (second.nextGoalTarget ?? second.goals) - second.goals;
      return (
        firstRemaining - secondRemaining ||
        second.goals - first.goals ||
        compareNames(first.playerName, second.playerName) ||
        (first.playerId ?? Number.MAX_SAFE_INTEGER) - (second.playerId ?? Number.MAX_SAFE_INTEGER)
      );
    })[0] ?? null;

  return {
    mode,
    matches,
    goalsScored,
    cleanSheets,
    uniqueScorers: scorerLeaderboard.length,
    injuries,
    redCards,
    impactSubUses,
    scorers: scorerLeaderboard,
    topScorer: scorerLeaderboard[0] ?? null,
    nextPlayerGoalMilestone: nextMilestoneScorer?.nextGoalTarget === null || !nextMilestoneScorer
      ? null
      : {
          playerId: nextMilestoneScorer.playerId,
          playerName: nextMilestoneScorer.playerName,
          currentGoals: nextMilestoneScorer.goals,
          targetGoals: nextMilestoneScorer.nextGoalTarget,
          goalsRemaining: nextMilestoneScorer.nextGoalTarget - nextMilestoneScorer.goals
        }
  };
}
