import { getStarterSlots } from "./formations";
import { buildRoundRobin, createHistoricalOpponent, getSkillBand } from "./matchmaking";
import { createRng, pickOne } from "./rng";
import type { DraftMode, DraftPick, Fixture, FixtureResult, ManagerSquad, MatchEvent } from "./types";

export const INVINCIBLE_TEAM_TALK_LIMIT = 3;
export const TEAM_TALK_EXPECTED_GOALS_BONUS = 0.18;
export const OUT_OF_FORM_EXPECTED_GOALS_PENALTY = 0.12;

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
  boostsRemaining: number;
  boostsUsed: number;
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
    boostsRemaining: INVINCIBLE_TEAM_TALK_LIMIT,
    boostsUsed: 0,
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

export function seasonUnavailablePlayerIds(injuryGamesByPlayerId: Record<number, number>): number[] {
  return Object.entries(injuryGamesByPlayerId)
    .filter(([, games]) => games > 0)
    .map(([playerId]) => Number(playerId));
}

export function decrementSeasonInjuries(injuryGamesByPlayerId: Record<number, number>): Record<number, number> {
  return Object.fromEntries(
    Object.entries(injuryGamesByPlayerId)
      .map(([playerId, games]) => [Number(playerId), Math.max(0, games - 1)] as const)
      .filter(([, games]) => games > 0)
  );
}

export function availableSeasonBench(human: ManagerSquad, injuryGamesByPlayerId: Record<number, number>, excludedIds: number[] = []): DraftPick[] {
  const unavailable = new Set([...seasonUnavailablePlayerIds(injuryGamesByPlayerId), ...excludedIds]);
  return human.picks.filter((pick) => pick.target === "SUB" && !unavailable.has(pick.player.i));
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
    const games = 1 + Math.floor(rng() * 5);
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
  const outOfFormChance = params.outOfFormChance ?? 0.24;
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
  outOfFormPlayerId?: number;
  outOfFormSubstituteId?: number;
}): ManagerSquad {
  const unavailable = seasonUnavailablePlayerIds(params.injuryGamesByPlayerId);
  const substitutions = { ...params.human.substitutions };
  if (params.outOfFormPlayerId !== undefined && params.outOfFormSubstituteId !== undefined) {
    unavailable.push(params.outOfFormPlayerId);
    substitutions[params.outOfFormPlayerId] = params.outOfFormSubstituteId;
  }
  return {
    ...params.human,
    injuredPlayerIds: Array.from(new Set([...params.human.injuredPlayerIds, ...unavailable])),
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
    const games = 1 + Math.floor(rng() * 5);
    injuryGamesByPlayerId[playerId] = Math.max(injuryGamesByPlayerId[playerId] ?? 0, games);
    return {
      playerId,
      playerName: String(params.result.events.find((event) => event.playerId === playerId)?.playerName ?? `Player ${playerId}`),
      games
    };
  });
  return { injuryGamesByPlayerId, newInjuries };
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
