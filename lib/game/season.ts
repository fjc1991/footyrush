import { getStarterSlots } from "./formations";
import { buildRoundRobin, createHistoricalOpponent, getSkillBand } from "./matchmaking";
import { createRng, pickOne } from "./rng";
import type { DraftMode, DraftPick, Fixture, FixtureResult, ManagerSquad, MatchEvent } from "./types";

export const INVINCIBLE_TEAM_TALK_LIMIT = 2;
export const TEAM_TALK_EXPECTED_GOALS_BONUS = 0.18;
export const OUT_OF_FORM_EXPECTED_GOALS_PENALTY = 0.12;
export const SEASON_RED_CARD_SUSPENSION_GAMES = 3;

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
  return {
    id: `invincible-${Date.now()}-${Math.floor(rng() * 10000)}`,
    managers,
    rounds: buildDoubleRoundRobin(managers),
    skillBand,
    currentMatchday: 0,
    results: [],
    injuryGamesByPlayerId: {},
    suspensionGamesByPlayerId: {},
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

  const trainingInjuryChance = params.trainingInjuryChance ?? 0.13;
  if (starters.length > 0 && rng() < trainingInjuryChance) {
    const pick = pickOne(starters, rng);
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
