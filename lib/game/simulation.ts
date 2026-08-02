import { effectiveRating } from "./data";
import { applyBoostToRating } from "./boosts";
import { getStarterSlots } from "./formations";
import { createImpactSubPlan, type ImpactSubPlan } from "./impact-sub";
import { compareMatchEventsChronologically } from "./match-presentation";
import { clamp, createRng, pickOne, weightedPick } from "./rng";
import type { CasualtyDirective, DraftPick, Fixture, FixtureResult, FormationSlot, ManagerSquad, MatchEvent, Player, Standing } from "./types";

interface StrengthProfile {
  overall: number;
  attack: number;
  midfield: number;
  defense: number;
  keeper: number;
  benchDepth: number;
}

/** Small in-match swings make incidents matter without letting one event decide every result. */
export const INJURY_OWN_EXPECTED_GOALS_PENALTY = 0.06;
export const INJURY_OPPONENT_EXPECTED_GOALS_BONUS = 0.06;
export const RED_CARD_OWN_EXPECTED_GOALS_PENALTY = 0.22;
export const RED_CARD_OPPONENT_EXPECTED_GOALS_BONUS = 0.3;

interface ActivePlayer {
  pick: DraftPick | null;
  rating: number;
  slot: FormationSlot;
}

function unavailable(manager: ManagerSquad): number[] {
  return [...manager.injuredPlayerIds, ...manager.suspendedPlayerIds];
}

export function calculateSquadStrength(manager: ManagerSquad): StrengthProfile {
  const active = getActiveStarters(manager);
  const bench = manager.picks.filter((pick) => pick.target === "SUB" && !unavailable(manager).includes(pick.player.i));
  const byLine = (line: "attack" | "midfield" | "defense" | "keeper") =>
    active.filter((entry) => entry.slot.line === line);

  const average = (entries: ActivePlayer[], fallback: number) =>
    entries.length > 0 ? entries.reduce((sum, entry) => sum + entry.rating, 0) / entries.length : fallback;

  const attack = average(byLine("attack"), 70);
  const midfield = average(byLine("midfield"), 70);
  const defense = average(byLine("defense"), 70);
  const keeper = average(byLine("keeper"), 70);
  const benchDepth = bench.length > 0 ? bench.reduce((sum, pick) => sum + pick.effectiveRating, 0) / bench.length : 60;
  const overall = attack * 0.29 + midfield * 0.27 + defense * 0.27 + keeper * 0.12 + benchDepth * 0.05;

  return { overall, attack, midfield, defense, keeper, benchDepth };
}

export function simulateFixture(params: {
  fixture: Fixture;
  home: ManagerSquad;
  away: ManagerSquad;
  seed: string;
  homeExpectedGoalsModifier?: number;
  awayExpectedGoalsModifier?: number;
  /** Healthy outfield bench player to prime for a deterministic second-half impact change. */
  homeImpactSubPlayerId?: number | null;
  /** Healthy outfield bench player to prime for a deterministic second-half impact change. */
  awayImpactSubPlayerId?: number | null;
  /**
   * Overrides the default random casualty rolls for a side. A `CasualtyDirective` forces exactly that
   * casualty (choosing the victim by weight); `null` guarantees the side takes no casualty this match;
   * `undefined` keeps the original random behaviour (AI opponents, mini-leagues, exhibitions).
   */
  homeCasualty?: CasualtyDirective | null;
  awayCasualty?: CasualtyDirective | null;
}): FixtureResult {
  const rng = createRng(params.seed);
  const homeImpactSubPlan = createImpactSubPlan({
    manager: params.home,
    playerId: params.homeImpactSubPlayerId,
    seed: params.seed
  });
  const awayImpactSubPlan = createImpactSubPlan({
    manager: params.away,
    playerId: params.awayImpactSubPlayerId,
    seed: params.seed
  });
  const homeStrength = calculateSquadStrength(params.home);
  const awayStrength = calculateSquadStrength(params.away);
  // Slight edge from manager quality: a full ~48-point rating gap (0–100 scale) shifts each
  // side's expected goals by ~0.24, so a better manager nudges results without overriding the squad.
  const managerEdge = (params.home.managerRating - params.away.managerRating) / 200;
  const homeExpected = clamp(
    1.15 +
      (homeStrength.attack - awayStrength.defense) / 21 +
      (homeStrength.overall - awayStrength.overall) / 32 +
      0.08 +
      managerEdge +
      (params.homeExpectedGoalsModifier ?? 0),
    0.15,
    3.6
  );
  const awayExpected = clamp(
    1.05 +
      (awayStrength.attack - homeStrength.defense) / 21 +
      (awayStrength.overall - homeStrength.overall) / 32 -
      managerEdge +
      (params.awayExpectedGoalsModifier ?? 0),
    0.15,
    3.6
  );
  const baseHomeGoals = sampleGoals(homeExpected, rng);
  const baseAwayGoals = sampleGoals(awayExpected, rng);
  const events: MatchEvent[] = [
    event(params.fixture.id, 1, "kickoff", undefined, undefined, { home: params.home.displayName, away: params.away.displayName })
  ];

  // Decide injuries/red cards up front so later events (goals, chances, near misses)
  // never feature a player after the second they left the pitch.
  const homeOff = determineCasualties(
    params.home,
    rng,
    params.homeCasualty,
    homeImpactSubPlan
  );
  const awayOff = determineCasualties(
    params.away,
    rng,
    params.awayCasualty,
    awayImpactSubPlan
  );
  // Casualties can empty the intended tactical line or force the primed player
  // on early. Resolve that interaction once, then use the same actual entry for
  // narration, lineups and the post-entry score modifier.
  const homeImpactSub = resolveImpactSubTransition(
    params.home,
    homeOff,
    homeImpactSubPlan
  );
  const awayImpactSub = resolveImpactSubTransition(
    params.away,
    awayOff,
    awayImpactSubPlan
  );
  reconcileImpactSubCasualties(homeOff, homeImpactSub);
  reconcileImpactSubCasualties(awayOff, awayImpactSub);
  pushCasualtyEvents(events, params.fixture.id, params.home, homeOff);
  pushCasualtyEvents(events, params.fixture.id, params.away, awayOff);
  pushImpactSubEvent(events, params.fixture.id, params.home, homeOff, homeImpactSub);
  pushImpactSubEvent(events, params.fixture.id, params.away, awayOff, awayImpactSub);

  let homeGoalsAtBreak = 0;
  let awayGoalsAtBreak = 0;

  let goalSchedule: ScheduledGoal[] = [
    ...Array.from({ length: baseHomeGoals }, () => ({ manager: params.home, off: homeOff, impactSub: homeImpactSub })),
    ...Array.from({ length: baseAwayGoals }, () => ({ manager: params.away, off: awayOff, impactSub: awayImpactSub }))
  ]
    .map((goal) => ({ ...goal, second: 8 + Math.floor(rng() * 78), order: rng() }))
    .sort((first, second) => first.second - second.second || first.order - second.order);

  // Impact Subs alter only the part of the score story after they enter. Base
  // goals keep the same seeded schedule, while positive threat adds post-entry
  // goals and defensive threat can suppress only post-entry opposition goals.
  // This makes the advertised around-the-hour decision temporally honest.
  goalSchedule = applyImpactGoalModifier({
    schedule: goalSchedule,
    target: params.home,
    targetOff: homeOff,
    targetImpactSub: homeImpactSub,
    activation: homeImpactSub,
    modifier: homeImpactSub?.ownExpectedGoalsModifier ?? 0,
    seed: `${params.seed}:impact:home-own`
  });
  goalSchedule = applyImpactGoalModifier({
    schedule: goalSchedule,
    target: params.away,
    targetOff: awayOff,
    targetImpactSub: awayImpactSub,
    activation: awayImpactSub,
    modifier: awayImpactSub?.ownExpectedGoalsModifier ?? 0,
    seed: `${params.seed}:impact:away-own`
  });
  goalSchedule = applyImpactGoalModifier({
    schedule: goalSchedule,
    target: params.home,
    targetOff: homeOff,
    targetImpactSub: homeImpactSub,
    activation: awayImpactSub,
    modifier: awayImpactSub?.opponentExpectedGoalsModifier ?? 0,
    seed: `${params.seed}:impact:away-on-home`
  });
  goalSchedule = applyImpactGoalModifier({
    schedule: goalSchedule,
    target: params.away,
    targetOff: awayOff,
    targetImpactSub: awayImpactSub,
    activation: homeImpactSub,
    modifier: homeImpactSub?.opponentExpectedGoalsModifier ?? 0,
    seed: `${params.seed}:impact:home-on-away`
  });
  goalSchedule = applyCasualtyGoalModifiers({
    schedule: goalSchedule,
    affected: params.home,
    affectedOff: homeOff,
    affectedImpactSub: homeImpactSub,
    opponent: params.away,
    opponentOff: awayOff,
    opponentImpactSub: awayImpactSub,
    seed: `${params.seed}:casualty:home`
  });
  goalSchedule = applyCasualtyGoalModifiers({
    schedule: goalSchedule,
    affected: params.away,
    affectedOff: awayOff,
    affectedImpactSub: awayImpactSub,
    opponent: params.home,
    opponentOff: homeOff,
    opponentImpactSub: homeImpactSub,
    seed: `${params.seed}:casualty:away`
  }).sort((first, second) => first.second - second.second || first.order - second.order);

  const homeGoals = goalSchedule.filter((goal) => goal.manager.id === params.home.id).length;
  const awayGoals = goalSchedule.filter((goal) => goal.manager.id === params.away.id).length;

  goalSchedule.forEach(({ manager, off, impactSub, second }) => {
    const player = chooseScorerAt(manager, second, off, impactSub, rng);
    if (manager.id === params.home.id && second <= 45) homeGoalsAtBreak += 1;
    if (manager.id === params.away.id && second <= 45) awayGoalsAtBreak += 1;
    events.push(event(params.fixture.id, second, "goal", manager.id, player, { manager: manager.displayName }));
  });
  events.push(event(params.fixture.id, 45, "half_time", undefined, undefined, { homeGoals: homeGoalsAtBreak, awayGoals: awayGoalsAtBreak }));

  addChances(events, params.fixture.id, params.home, params.away, homeOff, awayOff, homeImpactSub, awayImpactSub, rng);
  addNearMisses(events, params.fixture.id, params.home, params.away, homeOff, awayOff, homeImpactSub, awayImpactSub, rng);
  const homeInjuries = casualtyIds(homeOff, "injury");
  const awayInjuries = casualtyIds(awayOff, "injury");
  const homeRedCards = casualtyIds(homeOff, "redCard");
  const awayRedCards = casualtyIds(awayOff, "redCard");
  events.push(event(params.fixture.id, 90, "full_time", undefined, undefined, { homeGoals, awayGoals }));
  events.sort(compareMatchEventsChronologically);
  // A player can produce two otherwise-identical events (e.g. two goals in the same second);
  // suffix the sorted position so ids stay unique.
  const uniqueEvents = events.map((entry, index) => ({ ...entry, id: `${entry.id}-${index}` }));

  return {
    fixtureId: params.fixture.id,
    round: params.fixture.round,
    homeId: params.home.id,
    awayId: params.away.id,
    homeGoals,
    awayGoals,
    events: uniqueEvents,
    homeInjuries,
    awayInjuries,
    homeRedCards,
    awayRedCards,
    playedAt: new Date().toISOString()
  };
}

export function computeStandings(managers: ManagerSquad[], results: FixtureResult[]): Standing[] {
  const rows = new Map<string, Standing>();
  managers.forEach((manager) => {
    rows.set(manager.id, {
      managerId: manager.id,
      displayName: manager.displayName,
      kind: manager.kind,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0
    });
  });

  results.forEach((result) => {
    const home = rows.get(result.homeId);
    const away = rows.get(result.awayId);
    if (!home || !away) {
      return;
    }

    applyResult(home, result.homeGoals, result.awayGoals);
    applyResult(away, result.awayGoals, result.homeGoals);
  });

  return Array.from(rows.values())
    .map((standing) => ({
      ...standing,
      goalDifference: standing.goalsFor - standing.goalsAgainst
    }))
    .sort(
      (first, second) =>
        second.points - first.points ||
        second.goalDifference - first.goalDifference ||
        second.goalsFor - first.goalsFor ||
        first.displayName.localeCompare(second.displayName)
    );
}

export function applyFixtureInjuries(managers: ManagerSquad[], result: FixtureResult): ManagerSquad[] {
  return managers.map((manager) => {
    const injuries = manager.id === result.homeId ? result.homeInjuries : manager.id === result.awayId ? result.awayInjuries : [];
    const redCards = manager.id === result.homeId ? result.homeRedCards : manager.id === result.awayId ? result.awayRedCards : [];
    if (injuries.length === 0 && redCards.length === 0) {
      return manager;
    }
    return {
      ...manager,
      injuredPlayerIds: Array.from(new Set([...manager.injuredPlayerIds, ...injuries])),
      suspendedPlayerIds: Array.from(new Set([...manager.suspendedPlayerIds, ...redCards]))
    };
  });
}

/** Record the human manager's chosen substitution so it persists into future rounds. */
export function applySubstitution(
  managers: ManagerSquad[],
  injuredPlayerId: number,
  subPlayerId: number
): ManagerSquad[] {
  return managers.map((manager) => {
    if (manager.id !== "human") return manager;
    return {
      ...manager,
      substitutions: { ...manager.substitutions, [injuredPlayerId]: subPlayerId }
    };
  });
}

function getActiveStarters(manager: ManagerSquad): ActivePlayer[] {
  const starterSlots = getStarterSlots(manager.formationId);
  const out = unavailable(manager);
  const usedReplacementIds = new Set<number>();
  return starterSlots.map((slot) => {
    const starter = manager.picks.find((pick) => pick.slotId === slot.id);
    if (!starter) {
      throw new Error(`Missing starter ${slot.id} for ${manager.displayName}.`);
    }
    if (!out.includes(starter.player.i)) {
      return { pick: starter, rating: starter.effectiveRating, slot };
    }
    const chosenSubId = manager.substitutions[starter.player.i];
    const chosenSub =
      chosenSubId && !out.includes(chosenSubId) && !usedReplacementIds.has(chosenSubId)
        ? manager.picks.find((pick) => pick.player.i === chosenSubId && pick.target === "SUB") ?? null
        : null;
    const replacement = chosenSub ?? selectBestSub(manager.picks, slot.target, [...out, ...usedReplacementIds]);
    if (replacement) {
      usedReplacementIds.add(replacement.player.i);
    }
    return {
      pick: replacement,
      rating: replacement ? applyBoostToRating(effectiveRating(replacement.player, slot.target), replacement.boost, replacement.boostActive) - 2 : starter.effectiveRating - 9,
      slot
    };
  });
}

function selectBestSub(picks: DraftPick[], target: DraftPick["target"], excludedIds: number[]): DraftPick | null {
  return (
    picks
      .filter((pick) => pick.target === "SUB" && !excludedIds.includes(pick.player.i))
      .map((pick) => ({ pick, rating: applyBoostToRating(effectiveRating(pick.player, target), pick.boost, pick.boostActive) }))
      .filter((entry) => entry.rating > 0)
      .sort((first, second) => second.rating - first.rating)[0]?.pick ?? null
  );
}

function sampleGoals(expected: number, rng: () => number): number {
  const limit = Math.exp(-expected);
  let goals = 0;
  let product = 1;
  do {
    goals += 1;
    product *= rng();
  } while (product > limit && goals < 6);
  return goals - 1;
}

interface Casualty {
  kind: "injury" | "redCard";
  second: number;
  replacementId: number | null;
  replacementOnSecond: number;
}

interface ScheduledGoal {
  manager: ManagerSquad;
  off: Map<number, Casualty>;
  impactSub: ImpactSubPlan | null;
  second: number;
  order: number;
}

function applyImpactGoalModifier(params: {
  schedule: ScheduledGoal[];
  target: ManagerSquad;
  targetOff: Map<number, Casualty>;
  targetImpactSub: ImpactSubPlan | null;
  activation: ImpactSubPlan | null;
  modifier: number;
  seed: string;
}): ScheduledGoal[] {
  if (!params.activation || params.modifier === 0) return params.schedule;
  return applyTimedGoalModifier({
    schedule: params.schedule,
    target: params.target,
    targetOff: params.targetOff,
    targetImpactSub: params.targetImpactSub,
    firstAffectedSecond: Math.min(89, params.activation.minute + 1),
    modifier: params.modifier,
    seed: params.seed
  });
}

function applyCasualtyGoalModifiers(params: {
  schedule: ScheduledGoal[];
  affected: ManagerSquad;
  affectedOff: Map<number, Casualty>;
  affectedImpactSub: ImpactSubPlan | null;
  opponent: ManagerSquad;
  opponentOff: Map<number, Casualty>;
  opponentImpactSub: ImpactSubPlan | null;
  seed: string;
}): ScheduledGoal[] {
  return Array.from(params.affectedOff.values())
    .sort((first, second) => first.second - second.second || first.kind.localeCompare(second.kind))
    .reduce((schedule, casualty, index) => {
      const ownPenalty = casualty.kind === "redCard"
        ? RED_CARD_OWN_EXPECTED_GOALS_PENALTY
        : INJURY_OWN_EXPECTED_GOALS_PENALTY;
      const opponentBonus = casualty.kind === "redCard"
        ? RED_CARD_OPPONENT_EXPECTED_GOALS_BONUS
        : INJURY_OPPONENT_EXPECTED_GOALS_BONUS;
      const firstAffectedSecond = Math.min(89, casualty.second + 1);
      const afterOwnPenalty = applyTimedGoalModifier({
        schedule,
        target: params.affected,
        targetOff: params.affectedOff,
        targetImpactSub: params.affectedImpactSub,
        firstAffectedSecond,
        modifier: -ownPenalty,
        seed: `${params.seed}:${index}:${casualty.kind}:own`
      });
      return applyTimedGoalModifier({
        schedule: afterOwnPenalty,
        target: params.opponent,
        targetOff: params.opponentOff,
        targetImpactSub: params.opponentImpactSub,
        firstAffectedSecond,
        modifier: opponentBonus,
        seed: `${params.seed}:${index}:${casualty.kind}:opponent`
      });
    }, params.schedule);
}

function applyTimedGoalModifier(params: {
  schedule: ScheduledGoal[];
  target: ManagerSquad;
  targetOff: Map<number, Casualty>;
  targetImpactSub: ImpactSubPlan | null;
  firstAffectedSecond: number;
  modifier: number;
  seed: string;
}): ScheduledGoal[] {
  if (params.modifier === 0) return params.schedule;
  const rng = createRng(params.seed);

  if (params.modifier > 0) {
    const extraGoals = sampleGoals(params.modifier, rng);
    if (extraGoals === 0) return params.schedule;
    const remainingSeconds = Math.max(1, 90 - params.firstAffectedSecond);
    return [
      ...params.schedule,
      ...Array.from({ length: extraGoals }, (): ScheduledGoal => ({
        manager: params.target,
        off: params.targetOff,
        impactSub: params.targetImpactSub,
        second: params.firstAffectedSecond + Math.floor(rng() * remainingSeconds),
        order: rng()
      }))
    ];
  }

  const suppressions = sampleGoals(Math.abs(params.modifier), rng);
  if (suppressions === 0) return params.schedule;
  const candidates = params.schedule
    .map((goal, index) => ({ goal, index, order: rng() }))
    .filter(
      ({ goal }) =>
        goal.manager.id === params.target.id &&
        goal.second >= params.firstAffectedSecond
    )
    .sort((first, second) => first.order - second.order)
    .slice(0, suppressions);
  if (candidates.length === 0) return params.schedule;
  const removed = new Set(candidates.map(({ index }) => index));
  return params.schedule.filter((_, index) => !removed.has(index));
}

/** Decide which (if any) starter is injured or sent off this match, and who replaces them. */
function determineCasualties(
  manager: ManagerSquad,
  rng: () => number,
  directive?: CasualtyDirective | null,
  impactSub: ImpactSubPlan | null = null
): Map<number, Casualty> {
  const offMap = new Map<number, Casualty>();
  // `null` = a controlled side (e.g. the human in a Be Invincible season) with no scheduled casualty
  // this match: never roll a random injury or red card.
  if (directive === null) {
    return offMap;
  }
  const out = unavailable(manager);
  const slots = getStarterSlots(manager.formationId);
  const active = getActiveStarters(manager);

  if (directive) {
    setForcedCasualty(
      offMap,
      manager,
      active,
      slots,
      out,
      rng,
      directive,
      impactSub
    );
    return offMap;
  }

  if (rng() <= 0.18) {
    // Goalkeepers never pick up in-match injuries (only red cards can sideline a GK).
    const eligible = active.flatMap((entry, index) =>
      entry.pick && !out.includes(entry.pick.player.i) && !entry.pick.player.p.includes("GK")
        ? [{ entry: { ...entry, pick: entry.pick }, slot: slots[index] }]
        : []
    );
    if (eligible.length > 0) {
      const { entry, slot } = pickOne(eligible, rng);
      const second = 20 + Math.floor(rng() * 61);
      const activePlayerIds = active.flatMap((activePlayer) =>
        activePlayer.pick ? [activePlayer.pick.player.i] : []
      );
      const sub = selectInjuryReplacement(
        manager.picks,
        slot.target,
        [...out, ...activePlayerIds],
        second,
        impactSub
      );
      offMap.set(entry.pick.player.i, {
        kind: "injury",
        second,
        replacementId: sub?.player.i ?? null,
        replacementOnSecond: Math.min(89, second + 1)
      });
    }
  }

  if (rng() <= 0.04) {
    const excluded = [...out, ...Array.from(offMap.keys())];
    const eligible = active.flatMap((entry, index) =>
      entry.pick && !excluded.includes(entry.pick.player.i) ? [{ entry: { ...entry, pick: entry.pick }, slot: slots[index] }] : []
    );
    if (eligible.length > 0) {
      const { entry } = pickOne(eligible, rng);
      const second = 30 + Math.floor(rng() * 58);
      offMap.set(entry.pick.player.i, { kind: "redCard", second, replacementId: null, replacementOnSecond: Infinity });
    }
  }

  return offMap;
}

/** Force the season-scheduled casualty onto one starter, weighting the victim by season contribution. */
function setForcedCasualty(
  offMap: Map<number, Casualty>,
  manager: ManagerSquad,
  active: ActivePlayer[],
  slots: FormationSlot[],
  out: number[],
  rng: () => number,
  directive: CasualtyDirective,
  impactSub: ImpactSubPlan | null
): void {
  const weightFor = (playerId: number) => directive.weightByPlayerId?.[playerId] ?? 1;
  const eligible = active.flatMap((entry, index) => {
    const pick = entry.pick;
    if (!pick || out.includes(pick.player.i)) {
      return [];
    }
    // Goalkeepers never pick up in-match injuries (only red cards can sideline a GK).
    if (directive.kind === "injury" && pick.player.p.includes("GK")) {
      return [];
    }
    return [{ pick, slot: slots[index] }];
  });
  if (eligible.length === 0) {
    return;
  }
  const chosen = weightedPick(eligible, (candidate) => weightFor(candidate.pick.player.i), rng);
  if (directive.kind === "injury") {
    const second = 20 + Math.floor(rng() * 61);
    const activePlayerIds = active.flatMap((activePlayer) =>
      activePlayer.pick ? [activePlayer.pick.player.i] : []
    );
    const sub = selectInjuryReplacement(
      manager.picks,
      chosen.slot.target,
      [...out, ...activePlayerIds],
      second,
      impactSub
    );
    offMap.set(chosen.pick.player.i, {
      kind: "injury",
      second,
      replacementId: sub?.player.i ?? null,
      replacementOnSecond: Math.min(89, second + 1)
    });
    return;
  }
  const second = 30 + Math.floor(rng() * 58);
  offMap.set(chosen.pick.player.i, { kind: "redCard", second, replacementId: null, replacementOnSecond: Infinity });
}

/**
 * Keep the primed player available for the tactical change whenever another
 * healthy substitute can cover an injury. If they are the only viable option
 * before the planned change, the injury substitution becomes their real Impact
 * entry. After the planned minute they are already committed to the pitch and
 * cannot also be an ordinary injury replacement.
 */
function selectInjuryReplacement(
  picks: DraftPick[],
  target: DraftPick["target"],
  excludedIds: number[],
  casualtySecond: number,
  impactSub: ImpactSubPlan | null
): DraftPick | null {
  if (!impactSub) {
    return selectBestSub(picks, target, excludedIds);
  }

  const alternate = selectBestSub(picks, target, [
    ...excludedIds,
    impactSub.playerId
  ]);
  if (alternate) {
    return alternate;
  }
  return casualtySecond <= impactSub.minute
    ? selectBestSub(picks, target, excludedIds)
    : null;
}

function pushCasualtyEvents(events: MatchEvent[], fixtureId: string, manager: ManagerSquad, offMap: Map<number, Casualty>): void {
  offMap.forEach((info, playerId) => {
    const pick = manager.picks.find((candidate) => candidate.player.i === playerId)!;
    events.push(event(fixtureId, info.second, info.kind === "injury" ? "injury" : "red_card", manager.id, pick.player, { manager: manager.displayName }));
    if (info.replacementId != null) {
      const subPick = manager.picks.find((candidate) => candidate.player.i === info.replacementId)!;
      events.push(event(fixtureId, info.replacementOnSecond, "substitution", manager.id, subPick.player, { manager: manager.displayName, off: pick.player.n }));
    }
  });
}

/**
 * Once the actual Impact change is known, a later casualty for the player who
 * really went off lands on the player who replaced them. This covers both the
 * originally planned change and an early-red fallback without narrating an
 * injury or dismissal for somebody who is already on the bench.
 */
function reconcileImpactSubCasualties(
  offMap: Map<number, Casualty>,
  impactSub: ImpactSubPlan | null
): void {
  if (!impactSub) return;
  const casualty = offMap.get(impactSub.offPlayerId);
  if (!casualty || casualty.second <= impactSub.minute) return;

  offMap.delete(impactSub.offPlayerId);
  offMap.set(impactSub.playerId, {
    ...casualty,
    // The impact player cannot replace themselves after being injured.
    replacementId:
      casualty.replacementId === impactSub.playerId ? null : casualty.replacementId
  });
}

function impactSubLineupChange(
  manager: ManagerSquad,
  second: number,
  offMap: Map<number, Casualty>,
  impactSub: ImpactSubPlan
): { selected: DraftPick; off: DraftPick } | null {
  const selected = manager.picks.find(
    (pick) => pick.player.i === impactSub.playerId && pick.target === "SUB"
  );
  if (!selected) return null;

  const lineup = activeLineupAt(manager, second, offMap, null);
  if (lineup.some((entry) => entry.pick?.player.i === selected.player.i)) {
    return null;
  }
  const plannedOff = lineup.find(
    (entry) => entry.pick?.player.i === impactSub.offPlayerId
  );
  const fallbackOff = lineup
    .filter(
      (entry): entry is ActivePlayer & { pick: DraftPick } =>
        entry.pick !== null && entry.slot.line === impactSub.targetLine
    )
    .sort(
      (first, secondEntry) =>
        first.rating - secondEntry.rating ||
        first.pick.player.i - secondEntry.pick.player.i
    )[0];
  const fallbackOutfielder = lineup
    .filter(
      (entry): entry is ActivePlayer & { pick: DraftPick } =>
        entry.pick !== null && entry.slot.line !== "keeper"
    )
    .sort(
      (first, secondEntry) =>
        first.rating - secondEntry.rating ||
        first.pick.player.i - secondEntry.pick.player.i
    )[0];
  const off = plannedOff?.pick ?? fallbackOff?.pick ?? fallbackOutfielder?.pick ?? null;
  return off ? { selected, off } : null;
}

/**
 * Turn the pre-match intention into the one authoritative in-match transition.
 * A forced early injury may already have introduced the primed player; otherwise
 * the planned player, same-line fallback or lowest-rated outfielder makes way at
 * the planned minute. The returned plan is the source of truth for every later
 * event and lineup calculation.
 */
function resolveImpactSubTransition(
  manager: ManagerSquad,
  offMap: Map<number, Casualty>,
  impactSub: ImpactSubPlan | null
): ImpactSubPlan | null {
  if (!impactSub) return null;

  const injuryEntry = Array.from(offMap.entries())
    .filter(
      ([, casualty]) =>
        casualty.kind === "injury" &&
        casualty.replacementId === impactSub.playerId &&
        casualty.second <= impactSub.minute
    )
    .sort(
      (first, second) =>
        first[1].replacementOnSecond - second[1].replacementOnSecond ||
        first[0] - second[0]
    )[0];
  if (injuryEntry) {
    const [offPlayerId, casualty] = injuryEntry;
    const off = manager.picks.find((pick) => pick.player.i === offPlayerId);
    if (!off) return null;
    return {
      ...impactSub,
      minute: casualty.replacementOnSecond,
      offPlayerId,
      offPlayerName: off.player.n
    };
  }

  const change = impactSubLineupChange(
    manager,
    impactSub.minute,
    offMap,
    impactSub
  );
  if (!change) return null;
  return {
    ...impactSub,
    offPlayerId: change.off.player.i,
    offPlayerName: change.off.player.n
  };
}

function pushImpactSubEvent(
  events: MatchEvent[],
  fixtureId: string,
  manager: ManagerSquad,
  offMap: Map<number, Casualty>,
  impactSub: ImpactSubPlan | null
): void {
  if (!impactSub) return;
  const change = impactSubLineupChange(
    manager,
    impactSub.minute,
    offMap,
    impactSub
  );
  if (!change) {
    // A first-half injury may have brought the selected player on early. Mark that
    // real change as the impact moment instead of emitting a duplicate substitution.
    const existing = events.find(
      (entry) =>
        entry.code === "substitution" &&
        entry.teamId === manager.id &&
        entry.playerId === impactSub.playerId
    );
    if (existing) {
      existing.params = {
        ...existing.params,
        impactSub: 1,
        impactRole: impactSub.role,
        impactLabel: impactSub.label
      };
    }
    return;
  }
  events.push(
    event(
      fixtureId,
      impactSub.minute,
      "substitution",
      manager.id,
      change.selected.player,
      {
        manager: manager.displayName,
        off: change.off.player.n,
        impactSub: 1,
        impactRole: impactSub.role,
        impactLabel: impactSub.label
      }
    )
  );
}

function casualtyIds(offMap: Map<number, Casualty>, kind: Casualty["kind"]): number[] {
  return Array.from(offMap.entries())
    .filter(([, info]) => info.kind === kind)
    .map(([playerId]) => playerId);
}

function applyCasualtiesToLineup(
  manager: ManagerSquad,
  lineup: ActivePlayer[],
  second: number,
  offMap: Map<number, Casualty>,
  applies: (casualty: Casualty) => boolean
): ActivePlayer[] {
  return lineup.map((entry) => {
    const pick = entry.pick;
    if (!pick) return entry;
    const casualty = offMap.get(pick.player.i);
    if (!casualty || casualty.second > second || !applies(casualty)) {
      return entry;
    }
    if (casualty.replacementId == null || second < casualty.replacementOnSecond) {
      return { ...entry, pick: null };
    }
    const replacement = manager.picks.find(
      (candidate) => candidate.player.i === casualty.replacementId
    );
    return replacement ? { ...entry, pick: replacement } : { ...entry, pick: null };
  });
}

function activeLineupAt(
  manager: ManagerSquad,
  second: number,
  offMap: Map<number, Casualty>,
  impactSub: ImpactSubPlan | null
): ActivePlayer[] {
  let lineup = getActiveStarters(manager);
  if (!impactSub || second < impactSub.minute) {
    return applyCasualtiesToLineup(manager, lineup, second, offMap, () => true);
  }

  // Same-minute stoppages precede the tactical substitution in match chronology.
  lineup = applyCasualtiesToLineup(
    manager,
    lineup,
    second,
    offMap,
    (casualty) => casualty.second <= impactSub.minute
  );
  const change = impactSubLineupChange(
    manager,
    impactSub.minute,
    offMap,
    impactSub
  );
  if (change) {
    lineup = lineup.map((entry) =>
      entry.pick?.player.i === change.off.player.i
        ? { ...entry, pick: change.selected }
        : entry
    );
  }
  return applyCasualtiesToLineup(
    manager,
    lineup,
    second,
    offMap,
    (casualty) => casualty.second > impactSub.minute
  );
}

/** The XI actually on the pitch at a given second, accounting for casualties and an impact change. */
function picksOnPitchAt(
  manager: ManagerSquad,
  second: number,
  offMap: Map<number, Casualty>,
  impactSub: ImpactSubPlan | null
): DraftPick[] {
  return activeLineupAt(manager, second, offMap, impactSub)
    .map((entry) => entry.pick)
    .filter((pick): pick is DraftPick => pick !== null);
}

function chooseScorerAt(
  manager: ManagerSquad,
  second: number,
  offMap: Map<number, Casualty>,
  impactSub: ImpactSubPlan | null,
  rng: () => number
): Player {
  const onPitch = picksOnPitchAt(manager, second, offMap, impactSub);
  const availablePicks = onPitch.length > 0 ? onPitch : manager.picks.filter((pick) => !unavailable(manager).includes(pick.player.i));
  const picks = availablePicks.length > 0 ? availablePicks : manager.picks;
  const outfieldPicks = picks.filter((pick) => !pick.player.p.includes("GK"));
  const scorerPicks = outfieldPicks.length > 0 ? outfieldPicks : picks;
  const weighted = picks.flatMap((pick) => {
    if (!scorerPicks.includes(pick)) {
      return [];
    }
    const attackingPosition = pick.player.p.some((position) => ["ST", "CF", "LW", "RW", "CAM"].includes(position));
    const boostWeight =
      pick.boostActive && (pick.boost?.id === "poacher" || pick.boost?.id === "talisman")
        ? 3
        : pick.boostActive && pick.boost?.id === "playmaker"
          ? 1
          : 0;
    const weight = (attackingPosition ? 8 : pick.player.p.includes("CM") ? 4 : 1) + boostWeight;
    return Array.from({ length: weight }, () => pick.player);
  });
  if (weighted.length > 0) {
    return pickOne(weighted, rng);
  }
  return pickOne(scorerPicks, rng).player;
}

function chooseEventPlayerAt(
  manager: ManagerSquad,
  second: number,
  offMap: Map<number, Casualty>,
  impactSub: ImpactSubPlan | null,
  rng: () => number
): Player {
  const onPitch = picksOnPitchAt(manager, second, offMap, impactSub);
  const availablePicks = onPitch.length > 0 ? onPitch : manager.picks.filter((pick) => !unavailable(manager).includes(pick.player.i));
  return pickOne(availablePicks.length > 0 ? availablePicks : manager.picks, rng).player;
}

function addChances(
  events: MatchEvent[],
  fixtureId: string,
  home: ManagerSquad,
  away: ManagerSquad,
  homeOff: Map<number, Casualty>,
  awayOff: Map<number, Casualty>,
  homeImpactSub: ImpactSubPlan | null,
  awayImpactSub: ImpactSubPlan | null,
  rng: () => number
): void {
  const sides = [
    { manager: home, off: homeOff, impactSub: homeImpactSub },
    { manager: away, off: awayOff, impactSub: awayImpactSub }
  ];
  const count = 4 + Math.floor(rng() * 4);
  for (let index = 0; index < count; index += 1) {
    const side = pickOne(sides, rng);
    const second = 6 + Math.floor(rng() * 80);
    const player = chooseEventPlayerAt(side.manager, second, side.off, side.impactSub, rng);
    events.push(event(fixtureId, second, rng() > 0.45 ? "chance" : "save", side.manager.id, player, { manager: side.manager.displayName }));
  }
}

function addNearMisses(
  events: MatchEvent[],
  fixtureId: string,
  home: ManagerSquad,
  away: ManagerSquad,
  homeOff: Map<number, Casualty>,
  awayOff: Map<number, Casualty>,
  homeImpactSub: ImpactSubPlan | null,
  awayImpactSub: ImpactSubPlan | null,
  rng: () => number
): void {
  const sides = [
    { manager: home, off: homeOff, impactSub: homeImpactSub },
    { manager: away, off: awayOff, impactSub: awayImpactSub }
  ];
  const count = 1 + Math.floor(rng() * 3);
  for (let index = 0; index < count; index += 1) {
    const side = pickOne(sides, rng);
    const second = 10 + Math.floor(rng() * 76);
    const player = chooseEventPlayerAt(side.manager, second, side.off, side.impactSub, rng);
    events.push(event(fixtureId, second, "near_miss", side.manager.id, player, { manager: side.manager.displayName }));
  }
}

function event(
  fixtureId: string,
  second: number,
  code: MatchEvent["code"],
  teamId?: string,
  player?: Player,
  params: Record<string, string | number> = {}
): MatchEvent {
  return {
    id: `${fixtureId}-${second}-${code}-${player?.i ?? "match"}-${Math.floor((player?.o ?? second) * 17)}`,
    second,
    code,
    teamId,
    playerId: player?.i,
    playerName: player?.n,
    params
  };
}

function applyResult(row: Standing, goalsFor: number, goalsAgainst: number): void {
  row.played += 1;
  row.goalsFor += goalsFor;
  row.goalsAgainst += goalsAgainst;
  if (goalsFor > goalsAgainst) {
    row.wins += 1;
    row.points += 3;
  } else if (goalsFor === goalsAgainst) {
    row.draws += 1;
    row.points += 1;
  } else {
    row.losses += 1;
  }
}
