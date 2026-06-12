import { clamp, createRng, pickOne, shuffle } from "./rng";
import type {
  DraftCandidate,
  FormationSlot,
  Player,
  Position,
  RawFootballData,
  SpinResult
} from "./types";

let cached: RawFootballData | null = null;

export async function loadFootballData(): Promise<RawFootballData> {
  if (cached) return cached;
  const res = await fetch("/data.json");
  if (!res.ok) throw new Error("Failed to load football data.");
  cached = (await res.json()) as RawFootballData;
  return cached;
}

/** Pre-seed the cache directly — used by tests and server-side code. */
export function seedFootballData(data: RawFootballData): void {
  cached = data;
}

/** Synchronous accessor — only safe after loadFootballData() or seedFootballData() has been called. */
export function getFootballData(): RawFootballData {
  if (!cached) throw new Error("Football data not loaded yet. Call loadFootballData() first.");
  return cached;
}

const fullbackPairs: Record<string, Position[]> = {
  LB: ["LWB"],
  LWB: ["LB", "LM"],
  RB: ["RWB"],
  RWB: ["RB", "RM"]
};

const widePairs: Record<string, Position[]> = {
  LW: ["LM", "RW"],
  RW: ["RM", "LW"],
  LM: ["LW", "LWB", "RM"],
  RM: ["RW", "RWB", "LM"]
};

const centralPairs: Record<string, Position[]> = {
  CM: ["CDM", "CAM"],
  CDM: ["CM", "CB"],
  CAM: ["CM", "CF"],
  CF: ["ST", "CAM"],
  ST: ["CF"]
};

export function squadKey(teamCode: string, year: number): string {
  return `${teamCode}|${year}`;
}

export function getSquad(teamCode: string, year: number): Player[] {
  const squad = getFootballData().squads[squadKey(teamCode, year)] ?? [];
  const seen = new Set<number>();
  return squad.filter((player) => {
    if (seen.has(player.i)) {
      return false;
    }
    seen.add(player.i);
    return true;
  });
}

export function getTeamName(teamCode: string): string {
  return getFootballData().teams[teamCode]?.name ?? teamCode;
}

export function positionFit(target: Position | "SUB", playerPositions: Position[]): number {
  if (target === "SUB") {
    return 0.92;
  }
  if (playerPositions.includes(target)) {
    return 1;
  }
  if (target === "CB" && playerPositions.some((position) => position === "CDM" || position === "LB" || position === "RB")) {
    return 0.9;
  }
  if (target === "GK") {
    return 0;
  }
  if (fullbackPairs[target]?.some((position) => playerPositions.includes(position))) {
    return 0.96;
  }
  if (widePairs[target]?.some((position) => playerPositions.includes(position))) {
    return 0.94;
  }
  if (centralPairs[target]?.some((position) => playerPositions.includes(position))) {
    return 0.93;
  }
  if ((target === "LB" || target === "RB") && playerPositions.includes("CB")) {
    return 0.85;
  }
  if ((target === "LW" || target === "RW") && playerPositions.includes("ST")) {
    return 0.82;
  }
  return 0;
}

export function effectiveRating(player: Player, target: Position | "SUB"): number {
  const fit = positionFit(target, player.p);
  if (fit <= 0) {
    return 0;
  }

  const roleBonus =
    target === "GK"
      ? player.def * 0.08 + player.phy * 0.04
      : target === "CB" || target === "LB" || target === "RB" || target === "LWB" || target === "RWB"
        ? player.def * 0.07 + player.phy * 0.04 + player.pac * 0.02
        : target === "CM" || target === "CDM" || target === "CAM"
          ? player.pas * 0.05 + player.dri * 0.04 + player.def * 0.025
          : player.sho * 0.055 + player.pac * 0.035 + player.dri * 0.035;

  return clamp(player.o * fit + roleBonus / 10, 1, 99);
}

export function getCandidates(
  teamCode: string,
  year: number,
  slot: FormationSlot,
  usedPlayerIds: Set<number>
): DraftCandidate[] {
  return getSquad(teamCode, year)
    .filter((player) => !usedPlayerIds.has(player.i))
    .map((player) => ({
      player,
      fit: positionFit(slot.target, player.p),
      effectiveRating: effectiveRating(player, slot.target)
    }))
    .filter((candidate) => candidate.fit > 0)
    .sort((first, second) => second.effectiveRating - first.effectiveRating);
}

export function spinForSlot(slot: FormationSlot, usedPlayerIds: Set<number>, seed = `${Date.now()}:${Math.random()}`): SpinResult {
  const data = getFootballData();
  const rng = createRng(seed);
  const combos = shuffle(data.combos, rng);
  let redraws = 0;

  for (const [teamCode, year] of combos) {
    const candidates = getCandidates(teamCode, year, slot, usedPlayerIds);
    if (candidates.length > 0) {
      return {
        teamCode,
        teamName: getTeamName(teamCode),
        year,
        slot,
        candidates: candidates.slice(0, 8),
        redraws
      };
    }
    redraws += 1;
  }

  throw new Error(`No legal candidates are available for ${slot.label}.`);
}

export function chooseWeightedCandidate(candidates: DraftCandidate[], seed: string): DraftCandidate {
  const rng = createRng(seed);
  const top = candidates.slice(0, Math.min(candidates.length, 10));
  const weighted = top.flatMap((candidate, index) => Array.from({ length: Math.max(1, 10 - index) }, () => candidate));
  return pickOne(weighted, rng);
}
