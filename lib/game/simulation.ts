import { effectiveRating } from "./data";
import { getStarterSlots } from "./formations";
import { clamp, createRng, pickOne } from "./rng";
import type { DraftPick, Fixture, FixtureResult, FormationSlot, ManagerSquad, MatchEvent, Player, Standing } from "./types";

interface StrengthProfile {
  overall: number;
  attack: number;
  midfield: number;
  defense: number;
  keeper: number;
  benchDepth: number;
}

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
}): FixtureResult {
  const rng = createRng(params.seed);
  const homeStrength = calculateSquadStrength(params.home);
  const awayStrength = calculateSquadStrength(params.away);
  const homeExpected = clamp(1.15 + (homeStrength.attack - awayStrength.defense) / 21 + (homeStrength.overall - awayStrength.overall) / 32 + 0.08, 0.15, 3.6);
  const awayExpected = clamp(1.05 + (awayStrength.attack - homeStrength.defense) / 21 + (awayStrength.overall - homeStrength.overall) / 32, 0.15, 3.6);
  const homeGoals = sampleGoals(homeExpected, rng);
  const awayGoals = sampleGoals(awayExpected, rng);
  const events: MatchEvent[] = [
    event(params.fixture.id, 1, "kickoff", undefined, undefined, { home: params.home.displayName, away: params.away.displayName })
  ];

  // Decide injuries/red cards up front so later events (goals, chances, near misses)
  // never feature a player after the second they left the pitch.
  const homeOff = determineCasualties(params.home, rng);
  const awayOff = determineCasualties(params.away, rng);
  pushCasualtyEvents(events, params.fixture.id, params.home, homeOff);
  pushCasualtyEvents(events, params.fixture.id, params.away, awayOff);

  let homeGoalsAtBreak = 0;
  let awayGoalsAtBreak = 0;

  const goalSchedule = [
    ...Array.from({ length: homeGoals }, () => ({ manager: params.home, off: homeOff })),
    ...Array.from({ length: awayGoals }, () => ({ manager: params.away, off: awayOff }))
  ]
    .map((goal) => ({ ...goal, second: 8 + Math.floor(rng() * 78), order: rng() }))
    .sort((first, second) => first.second - second.second || first.order - second.order);

  goalSchedule.forEach(({ manager, off, second }) => {
    const player = chooseScorerAt(manager, second, off, rng);
    if (manager.id === params.home.id && second <= 45) homeGoalsAtBreak += 1;
    if (manager.id === params.away.id && second <= 45) awayGoalsAtBreak += 1;
    events.push(event(params.fixture.id, second, "goal", manager.id, player, { manager: manager.displayName }));
  });
  events.push(event(params.fixture.id, 45, "half_time", undefined, undefined, { homeGoals: homeGoalsAtBreak, awayGoals: awayGoalsAtBreak }));

  addChances(events, params.fixture.id, params.home, params.away, homeOff, awayOff, rng);
  addNearMisses(events, params.fixture.id, params.home, params.away, homeOff, awayOff, rng);
  const homeInjuries = casualtyIds(homeOff, "injury");
  const awayInjuries = casualtyIds(awayOff, "injury");
  const homeRedCards = casualtyIds(homeOff, "redCard");
  const awayRedCards = casualtyIds(awayOff, "redCard");
  events.push(event(params.fixture.id, 90, "full_time", undefined, undefined, { homeGoals, awayGoals }));
  events.sort((first, second) => first.second - second.second || first.id.localeCompare(second.id));
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
        ? manager.picks.find((pick) => pick.player.i === chosenSubId) ?? null
        : null;
    const replacement = chosenSub ?? selectBestSub(manager.picks, slot.target, [...out, ...usedReplacementIds]);
    if (replacement) {
      usedReplacementIds.add(replacement.player.i);
    }
    return {
      pick: replacement,
      rating: replacement ? effectiveRating(replacement.player, slot.target) - 2 : starter.effectiveRating - 9,
      slot
    };
  });
}

function selectBestSub(picks: DraftPick[], target: DraftPick["target"], excludedIds: number[]): DraftPick | null {
  return (
    picks
      .filter((pick) => pick.target === "SUB" && !excludedIds.includes(pick.player.i))
      .map((pick) => ({ pick, rating: effectiveRating(pick.player, target) }))
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

/** Decide which (if any) starter is injured or sent off this match, and who replaces them. */
function determineCasualties(manager: ManagerSquad, rng: () => number): Map<number, Casualty> {
  const offMap = new Map<number, Casualty>();
  const out = unavailable(manager);
  const slots = getStarterSlots(manager.formationId);
  const active = getActiveStarters(manager);

  if (rng() <= 0.18) {
    const eligible = active.flatMap((entry, index) =>
      entry.pick && !out.includes(entry.pick.player.i) ? [{ entry: { ...entry, pick: entry.pick }, slot: slots[index] }] : []
    );
    if (eligible.length > 0) {
      const { entry, slot } = pickOne(eligible, rng);
      const second = 20 + Math.floor(rng() * 61);
      const sub = selectBestSub(manager.picks, slot.target, [...out, entry.pick.player.i]);
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

function casualtyIds(offMap: Map<number, Casualty>, kind: Casualty["kind"]): number[] {
  return Array.from(offMap.entries())
    .filter(([, info]) => info.kind === kind)
    .map(([playerId]) => playerId);
}

/** The XI actually on the pitch at a given second, accounting for in-match injuries/red cards. */
function picksOnPitchAt(manager: ManagerSquad, second: number, offMap: Map<number, Casualty>): DraftPick[] {
  return getActiveStarters(manager)
    .map(({ pick }) => {
      if (!pick) {
        return null;
      }
      const casualty = offMap.get(pick.player.i);
      if (!casualty || second <= casualty.second) {
        return pick;
      }
      if (casualty.replacementId == null || second < casualty.replacementOnSecond) {
        return null;
      }
      return manager.picks.find((candidate) => candidate.player.i === casualty.replacementId) ?? null;
    })
    .filter((pick): pick is DraftPick => pick !== null);
}

function chooseScorerAt(manager: ManagerSquad, second: number, offMap: Map<number, Casualty>, rng: () => number): Player {
  const onPitch = picksOnPitchAt(manager, second, offMap);
  const availablePicks = onPitch.length > 0 ? onPitch : manager.picks.filter((pick) => !unavailable(manager).includes(pick.player.i));
  const picks = availablePicks.length > 0 ? availablePicks : manager.picks;
  const weighted = picks.flatMap((pick) => {
    const attackingPosition = pick.player.p.some((position) => ["ST", "CF", "LW", "RW", "CAM"].includes(position));
    const weight = attackingPosition ? 8 : pick.player.p.includes("CM") ? 4 : 1;
    return Array.from({ length: weight }, () => pick.player);
  });
  if (weighted.length > 0) {
    return pickOne(weighted, rng);
  }
  return pickOne(picks, rng).player;
}

function chooseEventPlayerAt(manager: ManagerSquad, second: number, offMap: Map<number, Casualty>, rng: () => number): Player {
  const onPitch = picksOnPitchAt(manager, second, offMap);
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
  rng: () => number
): void {
  const sides = [
    { manager: home, off: homeOff },
    { manager: away, off: awayOff }
  ];
  const count = 4 + Math.floor(rng() * 4);
  for (let index = 0; index < count; index += 1) {
    const side = pickOne(sides, rng);
    const second = 6 + Math.floor(rng() * 80);
    const player = chooseEventPlayerAt(side.manager, second, side.off, rng);
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
  rng: () => number
): void {
  const sides = [
    { manager: home, off: homeOff },
    { manager: away, off: awayOff }
  ];
  const count = 1 + Math.floor(rng() * 3);
  for (let index = 0; index < count; index += 1) {
    const side = pickOne(sides, rng);
    const second = 10 + Math.floor(rng() * 76);
    const player = chooseEventPlayerAt(side.manager, second, side.off, rng);
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
