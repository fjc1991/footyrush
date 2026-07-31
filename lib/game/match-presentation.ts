import type { FixtureResult, MatchEvent, Standing } from "./types";

const ALWAYS_REVEALED_EVENT_CODES = new Set<MatchEvent["code"]>([
  "kickoff",
  "goal",
  "injury",
  "substitution",
  "red_card",
  "half_time",
  "full_time"
]);

const OPEN_PLAY_EVENT_CODES = new Set<MatchEvent["code"]>(["chance", "save", "near_miss"]);

/**
 * Events only carry a match minute, so ties need an explicit football chronology rather than
 * an alphabetical id sort. A stoppage happens before the resulting substitution, play resumes
 * after that change, and the half/full-time whistles close everything else in their minute.
 */
const MATCH_EVENT_PRIORITY: Record<MatchEvent["code"], number> = {
  kickoff: 0,
  injury: 10,
  red_card: 20,
  substitution: 30,
  goal: 40,
  chance: 50,
  save: 60,
  near_miss: 70,
  half_time: 80,
  full_time: 90
};

export function compareMatchEventsChronologically(first: MatchEvent, second: MatchEvent): number {
  return (
    first.second - second.second ||
    MATCH_EVENT_PRIORITY[first.code] - MATCH_EVENT_PRIORITY[second.code] ||
    first.id.localeCompare(second.id)
  );
}

export interface MatchScoreBeat {
  event: MatchEvent;
  homeGoals: number;
  awayGoals: number;
}

export type MatchFeedbackOutcome = "W" | "D" | "L";

export interface MatchFeedback {
  outcome: MatchFeedbackOutcome;
  pointsEarned: 0 | 1 | 3;
  positionBefore: number | null;
  positionAfter: number | null;
  unbeatenStreakBefore: number;
  unbeatenStreakAfter: number;
  firstLoss: boolean;
}

export interface BuildMatchFeedbackParams {
  /** Human fixtures completed before the current round, in chronological order. */
  previousHumanResults: FixtureResult[];
  /** All fixture results completed in the current round; AI fixtures are ignored for streaks. */
  completedRoundResults: FixtureResult[];
  previousStandings: Standing[];
  completedStandings: Standing[];
  currentHumanResult: FixtureResult;
  humanId?: string;
}

/**
 * Selects a compact, chronological match story without changing or synthesising events.
 * Decisive and structural beats are always retained; routine open play is capped at one
 * event in each half so it supplies atmosphere without turning the reveal into a ledger.
 */
export function selectMatchHighlights(events: MatchEvent[]): MatchEvent[] {
  const ordered = events
    .map((event, originalIndex) => ({ event, originalIndex }))
    .sort(
      (first, second) =>
        compareMatchEventsChronologically(first.event, second.event) ||
        first.originalIndex - second.originalIndex
    );
  let firstHalfOpenPlaySelected = false;
  let secondHalfOpenPlaySelected = false;

  return ordered.flatMap(({ event }) => {
    if (ALWAYS_REVEALED_EVENT_CODES.has(event.code)) {
      return [event];
    }
    if (!OPEN_PLAY_EVENT_CODES.has(event.code)) {
      return [];
    }

    if (event.second <= 45) {
      if (firstHalfOpenPlaySelected) {
        return [];
      }
      firstHalfOpenPlaySelected = true;
      return [event];
    }

    if (secondHalfOpenPlaySelected) {
      return [];
    }
    secondHalfOpenPlaySelected = true;
    return [event];
  });
}

/**
 * Adds the score visible at each selected beat. Scores are accumulated only from goal
 * events, so kickoff and early highlights cannot reveal the already-known final result.
 */
export function buildScoreTimeline(result: FixtureResult): MatchScoreBeat[] {
  let homeGoals = 0;
  let awayGoals = 0;

  return selectMatchHighlights(result.events).map((event) => {
    if (event.code === "goal") {
      if (event.teamId === result.homeId) {
        homeGoals += 1;
      } else if (event.teamId === result.awayId) {
        awayGoals += 1;
      }
    }
    return { event, homeGoals, awayGoals };
  });
}

/** Builds result feedback from completed data without changing standings or match results. */
export function buildMatchFeedback(params: BuildMatchFeedbackParams): MatchFeedback {
  const humanId = params.humanId ?? "human";
  const currentOutcome = humanOutcome(params.currentHumanResult, humanId);
  if (currentOutcome === null) {
    throw new Error(`Current result does not include human manager ${humanId}.`);
  }

  const previousHumanResults = params.previousHumanResults.filter((result) =>
    includesManager(result, humanId)
  );
  const previousFixtureIds = new Set(previousHumanResults.map((result) => result.fixtureId));
  const currentRoundHumanResults = params.completedRoundResults.filter(
    (result) =>
      includesManager(result, humanId) &&
      result.fixtureId !== params.currentHumanResult.fixtureId &&
      !previousFixtureIds.has(result.fixtureId)
  );
  const completedHumanResults = [
    ...previousHumanResults,
    ...currentRoundHumanResults,
    params.currentHumanResult
  ];
  const unbeatenStreakBefore = trailingUnbeatenStreak(previousHumanResults, humanId);

  return {
    outcome: currentOutcome,
    pointsEarned: currentOutcome === "W" ? 3 : currentOutcome === "D" ? 1 : 0,
    positionBefore: standingPosition(params.previousStandings, humanId),
    positionAfter: standingPosition(params.completedStandings, humanId),
    unbeatenStreakBefore,
    unbeatenStreakAfter: trailingUnbeatenStreak(completedHumanResults, humanId),
    firstLoss:
      currentOutcome === "L" &&
      previousHumanResults.every((result) => humanOutcome(result, humanId) !== "L")
  };
}

function includesManager(result: FixtureResult, managerId: string): boolean {
  return result.homeId === managerId || result.awayId === managerId;
}

function humanOutcome(result: FixtureResult, humanId: string): MatchFeedbackOutcome | null {
  if (!includesManager(result, humanId)) {
    return null;
  }
  const humanGoals = result.homeId === humanId ? result.homeGoals : result.awayGoals;
  const opponentGoals = result.homeId === humanId ? result.awayGoals : result.homeGoals;
  return humanGoals > opponentGoals ? "W" : humanGoals === opponentGoals ? "D" : "L";
}

function trailingUnbeatenStreak(results: FixtureResult[], humanId: string): number {
  let streak = 0;
  for (let index = results.length - 1; index >= 0; index -= 1) {
    const outcome = humanOutcome(results[index], humanId);
    if (outcome === null) {
      continue;
    }
    if (outcome === "L") {
      break;
    }
    streak += 1;
  }
  return streak;
}

function standingPosition(standings: Standing[], humanId: string): number | null {
  const index = standings.findIndex((standing) => standing.managerId === humanId);
  return index === -1 ? null : index + 1;
}
