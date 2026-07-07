import { getStarterSlots } from "./formations";
import { buildRoundRobin, createHistoricalOpponent, getSkillBand } from "./matchmaking";
import { createRng, pickOne, shuffle } from "./rng";
import type { DraftMode, DraftPick, Fixture, FixtureResult, ManagerSquad, MatchEvent, SeasonCasualtyKind } from "./types";

export const INVINCIBLE_TEAM_TALK_LIMIT = 2;
export const TEAM_TALK_EXPECTED_GOALS_BONUS = 0.18;
export const OUT_OF_FORM_EXPECTED_GOALS_PENALTY = 0.12;
export const SEASON_RED_CARD_SUSPENSION_GAMES = 3;
/** Whole-season ceiling on human injuries + red cards combined; the actual count is a random 0..N. */
export const INVINCIBLE_MAX_SEASON_CASUALTIES = 5;
/** Share of the season's casualties that are red cards rather than injuries. */
export const INVINCIBLE_RED_CARD_SHARE = 0.18;
/** Each season goal a player has scored multiplies how likely they are to be the casualty. */
export const SEASON_CASUALTY_GOAL_WEIGHT = 2;
/** Rating above this pivot adds a small "important player" tilt so key men are struck more often. */
export const SEASON_CASUALTY_RATING_PIVOT = 78;
export const SEASON_CASUALTY_RATING_WEIGHT = 0.15;

export interface SeasonTrainingInjury {
  playerId: number;
  playerName: string;
  games: number;
}

export interface SeasonOutOfForm {
  playerId: number;
  playerName: string;
}

export interface SeasonPregameDecision {
  matchday: number;
  trainingInjury?: SeasonTrainingInjury;
  outOfForm?: SeasonOutOfForm;
}

export interface InvincibleSeason {
  id: string;
  managers: ManagerSquad[];
  rounds: Fixture[][];
  skillBand: string;
  currentMatchday: number;
  results: FixtureResult[];
  injuryGamesByPlayerId: Record<number, number>;
  suspensionGamesByPlayerId: Record<number, number>;
  /** Whole-season casualty budget: matchday index → the injury/red card that strikes the human that round. */
  casualtySchedule: Record<number, SeasonCasualtyKind>;
  boostsRemaining: number;
  boostsUsed: number;
  teamTalksUsedByHalf: {
    first: boolean;
    second: boolean;
  };
  attemptId: string;
  officialAward: boolean | null;
  awardProduction: boolean | null;
}

export function createInvincibleSeason(params: {
  humanPicks: DraftPick[];
  humanName: string;
  formationId: string;
  mode: DraftMode;
  completedLeagues: number;
  mmr: number;
  managerRating?: number;
  attemptId: string;
  seed: string;
}): InvincibleSeason {
  const rng = createRng(params.seed);
  const skillBand = getSkillBand(params.completedLeagues, params.mmr);
  const human: ManagerSquad = {
    id: "human",
    displayName: params.humanName,
    kind: "human",
    source: "human",
    formationId: params.formationId,
    mode: params.mode,
    picks: params.humanPicks,
    mmr: params.mmr,
    managerRating: params.managerRating ?? 50,
    completedLeagues: params.completedLeagues,
    injuredPlayerIds: [],
    suspendedPlayerIds: [],
    substitutions: {}
  };

  const usedHistoricalCombos = new Set<string>();
  const opponents = Array.from({ length: 19 }, (_, index) =>
    createHistoricalOpponent({
      id: `invincible-${index + 1}`,
      seed: `${params.seed}:opponent:${index}`,
      usedCombos: usedHistoricalCombos,
      mmr: Math.max(0, Math.round(params.mmr + (rng() - 0.5) * 220)),
      completedLeagues: Math.floor(rng() * 24),
      managerRating: 42 + Math.round(rng() * 30)
    })
  );

  const managers = [human, ...opponents];
  const rounds = buildDoubleRoundRobin(managers);
  // A dedicated rng keeps the casualty budget independent of opponent generation above.
  const casualtySchedule = buildSeasonCasualtySchedule({
    totalMatchdays: rounds.length,
    rng: createRng(`${params.seed}:casualties`)
  });
  return {
    id: `invincible-${Date.now()}-${Math.floor(rng() * 10000)}`,
    managers,
    rounds,
    skillBand,
    currentMatchday: 0,
    results: [],
    injuryGamesByPlayerId: {},
    suspensionGamesByPlayerId: {},
    casualtySchedule,
    boostsRemaining: INVINCIBLE_TEAM_TALK_LIMIT,
    boostsUsed: 0,
    teamTalksUsedByHalf: { first: false, second: false },
    attemptId: params.attemptId,
    officialAward: null,
    awardProduction: null
  };
}

export function buildDoubleRoundRobin(managers: ManagerSquad[]): Fixture[][] {
  const firstLeg = buildRoundRobin(managers).map((round, roundIndex) =>
    round.map((fixture) => ({
      ...fixture,
      id: `s${roundIndex + 1}-${fixture.homeId}-${fixture.awayId}`,
      round: roundIndex + 1
    }))
  );
  const secondLeg = firstLeg.map((round, roundIndex) =>
    round.map((fixture) => ({
      id: `s${roundIndex + 1 + firstLeg.length}-${fixture.awayId}-${fixture.homeId}`,
      round: roundIndex + 1 + firstLeg.length,
      homeId: fixture.awayId,
      awayId: fixture.homeId
    }))
  );
  return [...firstLeg, ...secondLeg];
}

/**
 * Draws a whole-season casualty budget: a random 0..INVINCIBLE_MAX_SEASON_CASUALTIES injuries + red
 * cards, scattered across distinct matchdays so jeopardy is occasional rather than constant. Sometimes
 * returns an empty schedule (a lucky, casualty-free season).
 */
export function buildSeasonCasualtySchedule(params: {
  totalMatchdays: number;
  rng: () => number;
}): Record<number, SeasonCasualtyKind> {
  const { totalMatchdays, rng } = params;
  const schedule: Record<number, SeasonCasualtyKind> = {};
  if (totalMatchdays <= 0) {
    return schedule;
  }
  const count = Math.min(totalMatchdays, Math.floor(rng() * (INVINCIBLE_MAX_SEASON_CASUALTIES + 1)));
  const matchdays = shuffle(
    Array.from({ length: totalMatchdays }, (_, index) => index),
    rng
  ).slice(0, count);
  for (const matchday of matchdays) {
    schedule[matchday] = rng() < INVINCIBLE_RED_CARD_SHARE ? "redCard" : "injury";
  }
  return schedule;
}

/** Tallies how many league goals each human player has scored so far this season. */
export function humanSeasonGoalsByPlayer(results: FixtureResult[], humanId = "human"): Record<number, number> {
  const goals: Record<number, number> = {};
  for (const result of results) {
    for (const event of result.events) {
      if (event.code === "goal" && event.teamId === humanId && event.playerId !== undefined) {
        goals[event.playerId] = (goals[event.playerId] ?? 0) + 1;
      }
    }
  }
  return goals;
}

/**
 * Relative likelihood, per player, of being the one who goes off when a season casualty strikes.
 * Everyone starts on a base of 1 so nobody is safe, but season goals and squad rating tilt the odds so
 * your talisman is often — not always — the man you lose, giving the setback real bite.
 */
export function seasonCasualtyWeights(params: {
  human: ManagerSquad;
  results: FixtureResult[];
  humanId?: string;
}): Record<number, number> {
  const humanId = params.humanId ?? "human";
  const goals = humanSeasonGoalsByPlayer(params.results, humanId);
  const weights: Record<number, number> = {};
  for (const pick of params.human.picks) {
    const goalsScored = goals[pick.player.i] ?? 0;
    const ratingEdge = Math.max(0, pick.effectiveRating - SEASON_CASUALTY_RATING_PIVOT);
    weights[pick.player.i] =
      1 + goalsScored * SEASON_CASUALTY_GOAL_WEIGHT + ratingEdge * SEASON_CASUALTY_RATING_WEIGHT;
  }
  return weights;
}

export function currentHumanFixture(season: Pick<InvincibleSeason, "rounds" | "currentMatchday">): Fixture | null {
  return season.rounds[season.currentMatchday]?.find((fixture) => fixture.homeId === "human" || fixture.awayId === "human") ?? null;
}

export function seasonUnavailablePlayerIds(
  injuryGamesByPlayerId: Record<number, number>,
  suspensionGamesByPlayerId: Record<number, number> = {}
): number[] {
  const ids = new Set([...Object.keys(injuryGamesByPlayerId), ...Object.keys(suspensionGamesByPlayerId)]);
  return Array.from(ids)
    .map((playerId) => Number(playerId))
    .filter((playerId) => Math.max(injuryGamesByPlayerId[playerId] ?? 0, suspensionGamesByPlayerId[playerId] ?? 0) > 0);
}

export function decrementSeasonAbsences(absencesByPlayerId: Record<number, number>): Record<number, number> {
  return Object.fromEntries(
    Object.entries(absencesByPlayerId)
      .map(([playerId, games]) => [Number(playerId), Math.max(0, games - 1)] as const)
      .filter(([, games]) => games > 0)
  );
}

export const decrementSeasonInjuries = decrementSeasonAbsences;

export function availableSeasonBench(
  human: ManagerSquad,
  injuryGamesByPlayerId: Record<number, number>,
  excludedIds: number[] = [],
  suspensionGamesByPlayerId: Record<number, number> = {}
): DraftPick[] {
  const unavailable = new Set([...seasonUnavailablePlayerIds(injuryGamesByPlayerId, suspensionGamesByPlayerId), ...excludedIds]);
  return human.picks.filter((pick) => pick.target === "SUB" && !unavailable.has(pick.player.i));
}

export function seasonUnavailableStarters(params: {
  human: ManagerSquad;
  injuryGamesByPlayerId: Record<number, number>;
  suspensionGamesByPlayerId?: Record<number, number>;
}): DraftPick[] {
  const unavailable = new Set(seasonUnavailablePlayerIds(params.injuryGamesByPlayerId, params.suspensionGamesByPlayerId ?? {}));
  return getStarterSlots(params.human.formationId)
    .map((slot) => params.human.picks.find((pick) => pick.slotId === slot.id))
    .filter((pick): pick is DraftPick => pick !== undefined && unavailable.has(pick.player.i));
}

export function seasonMissingRequiredSubstitutions(params: {
  human: ManagerSquad;
  injuryGamesByPlayerId: Record<number, number>;
  suspensionGamesByPlayerId?: Record<number, number>;
}): DraftPick[] {
  const unavailable = new Set(seasonUnavailablePlayerIds(params.injuryGamesByPlayerId, params.suspensionGamesByPlayerId ?? {}));
  const usedSubs = new Set<number>();
  const missing: DraftPick[] = [];
  seasonUnavailableStarters(params).forEach((starter) => {
    const chosenSubId = params.human.substitutions[starter.player.i];
    if (!chosenSubId || unavailable.has(chosenSubId) || usedSubs.has(chosenSubId)) {
      missing.push(starter);
      return;
    }
    usedSubs.add(chosenSubId);
  });
  return missing;
}

export function teamTalkHalfForMatchday(matchday: number): "first" | "second" {
  return matchday < 19 ? "first" : "second";
}

export function canUseSeasonTeamTalk(season: Pick<InvincibleSeason, "currentMatchday" | "teamTalksUsedByHalf">): boolean {
  return !season.teamTalksUsedByHalf[teamTalkHalfForMatchday(season.currentMatchday)];
}

export function remainingSeasonTeamTalks(season: Pick<InvincibleSeason, "teamTalksUsedByHalf">): number {
  return Number(!season.teamTalksUsedByHalf.first) + Number(!season.teamTalksUsedByHalf.second);
}

export function markSeasonTeamTalkUsed(
  season: Pick<InvincibleSeason, "currentMatchday" | "teamTalksUsedByHalf">
): InvincibleSeason["teamTalksUsedByHalf"] {
  return { ...season.teamTalksUsedByHalf, [teamTalkHalfForMatchday(season.currentMatchday)]: true };
}

export function createSeasonPregame(params: {
  human: ManagerSquad;
  matchday: number;
  injuryGamesByPlayerId: Record<number, number>;
  seed: string;
  trainingInjuryChance?: number;
  outOfFormChance?: number;
}): { decision: SeasonPregameDecision; injuryGamesByPlayerId: Record<number, number> } {
  const rng = createRng(params.seed);
  const decision: SeasonPregameDecision = { matchday: params.matchday };
  const injuryGamesByPlayerId = { ...params.injuryGamesByPlayerId };
  const unavailableBefore = new Set(seasonUnavailablePlayerIds(injuryGamesByPlayerId));
  const starters = getStarterSlots(params.human.formationId)
    .map((slot) => params.human.picks.find((pick) => pick.slotId === slot.id))
    .filter((pick): pick is DraftPick => pick !== undefined && !unavailableBefore.has(pick.player.i));

  // Goalkeepers never pick up training injuries (only red cards can sideline a GK).
  const injuryCandidates = starters.filter((pick) => !pick.player.p.includes("GK"));
  // Defaults to 0: in Be Invincible all human injuries now come from the whole-season casualty budget
  // (see buildSeasonCasualtySchedule). Tests still pass an explicit chance to force deterministic events.
  const trainingInjuryChance = params.trainingInjuryChance ?? 0;
  if (injuryCandidates.length > 0 && rng() < trainingInjuryChance) {
    const pick = pickOne(injuryCandidates, rng);
    const games = 1 + Math.floor(rng() * 10);
    injuryGamesByPlayerId[pick.player.i] = Math.max(injuryGamesByPlayerId[pick.player.i] ?? 0, games);
    decision.trainingInjury = {
      playerId: pick.player.i,
      playerName: pick.player.n,
      games
    };
  }

  const unavailableAfter = new Set(seasonUnavailablePlayerIds(injuryGamesByPlayerId));
  const availableStarters = starters.filter((pick) => !unavailableAfter.has(pick.player.i));
  const hasBench = availableSeasonBench(params.human, injuryGamesByPlayerId).length > 0;
  const outOfFormChance = params.outOfFormChance ?? 0;
  if (availableStarters.length > 0 && hasBench && rng() < outOfFormChance) {
    const pick = pickOne(availableStarters, rng);
    decision.outOfForm = {
      playerId: pick.player.i,
      playerName: pick.player.n
    };
  }

  return { decision, injuryGamesByPlayerId };
}

export function managerForSeasonMatch(params: {
  human: ManagerSquad;
  injuryGamesByPlayerId: Record<number, number>;
  suspensionGamesByPlayerId?: Record<number, number>;
  outOfFormPlayerId?: number;
  outOfFormSubstituteId?: number;
}): ManagerSquad {
  const substitutions = { ...params.human.substitutions };
  const injuredPlayerIds = seasonUnavailablePlayerIds(params.injuryGamesByPlayerId);
  if (params.outOfFormPlayerId !== undefined && params.outOfFormSubstituteId !== undefined) {
    injuredPlayerIds.push(params.outOfFormPlayerId);
    substitutions[params.outOfFormPlayerId] = params.outOfFormSubstituteId;
  }
  return {
    ...params.human,
    injuredPlayerIds: Array.from(new Set([...params.human.injuredPlayerIds, ...injuredPlayerIds])),
    suspendedPlayerIds: Array.from(new Set([...params.human.suspendedPlayerIds, ...seasonUnavailablePlayerIds({}, params.suspensionGamesByPlayerId ?? {})])),
    substitutions
  };
}

export function applySeasonFixtureInjuries(params: {
  injuryGamesByPlayerId: Record<number, number>;
  result: FixtureResult;
  humanId?: string;
  seed: string;
}): { injuryGamesByPlayerId: Record<number, number>; newInjuries: SeasonTrainingInjury[] } {
  const humanId = params.humanId ?? "human";
  const injuredIds =
    params.result.homeId === humanId
      ? params.result.homeInjuries
      : params.result.awayId === humanId
        ? params.result.awayInjuries
        : [];
  const rng = createRng(params.seed);
  const injuryGamesByPlayerId = { ...params.injuryGamesByPlayerId };
  const newInjuries = injuredIds.map((playerId) => {
    const games = 1 + Math.floor(rng() * 10);
    injuryGamesByPlayerId[playerId] = Math.max(injuryGamesByPlayerId[playerId] ?? 0, games);
    return {
      playerId,
      playerName: String(params.result.events.find((event) => event.playerId === playerId)?.playerName ?? `Player ${playerId}`),
      games
    };
  });
  return { injuryGamesByPlayerId, newInjuries };
}

export interface SeasonSuspension {
  playerId: number;
  playerName: string;
  games: number;
}

export function applySeasonFixtureSuspensions(params: {
  suspensionGamesByPlayerId: Record<number, number>;
  result: FixtureResult;
  humanId?: string;
}): { suspensionGamesByPlayerId: Record<number, number>; newSuspensions: SeasonSuspension[] } {
  const humanId = params.humanId ?? "human";
  const suspendedIds =
    params.result.homeId === humanId
      ? params.result.homeRedCards
      : params.result.awayId === humanId
        ? params.result.awayRedCards
        : [];
  const suspensionGamesByPlayerId = { ...params.suspensionGamesByPlayerId };
  const newSuspensions = suspendedIds.map((playerId) => {
    suspensionGamesByPlayerId[playerId] = Math.max(suspensionGamesByPlayerId[playerId] ?? 0, SEASON_RED_CARD_SUSPENSION_GAMES);
    return {
      playerId,
      playerName: String(params.result.events.find((event) => event.playerId === playerId)?.playerName ?? `Player ${playerId}`),
      games: SEASON_RED_CARD_SUSPENSION_GAMES
    };
  });
  return { suspensionGamesByPlayerId, newSuspensions };
}

export function compactSeasonEvents(events: MatchEvent[]): MatchEvent[] {
  let openPlayEvents = 0;
  return events.filter((event) => {
    if (["kickoff", "goal", "injury", "red_card", "half_time", "full_time"].includes(event.code)) {
      return true;
    }
    if (["chance", "save", "near_miss"].includes(event.code) && openPlayEvents < 2) {
      openPlayEvents += 1;
      return true;
    }
    return false;
  });
}
