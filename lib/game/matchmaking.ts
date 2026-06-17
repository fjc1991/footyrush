import { draftTeamSeasonSquad } from "./draft";
import { getFootballData, getTeamName } from "./data";
import { FORMATION_LIST } from "./formations";
import { createRng, shuffle } from "./rng";
import type { DraftMode, DraftPick, Fixture, ManagerSquad } from "./types";

export function getSkillBand(completedLeagues: number, mmr: number): string {
  if (completedLeagues < 3) {
    return "rookie";
  }
  if (mmr < 300) {
    return "bronze";
  }
  if (mmr < 600) {
    return "silver";
  }
  if (mmr < 900) {
    return "gold";
  }
  return "elite";
}

export function createMinileague(params: {
  humanPicks: DraftPick[];
  humanName: string;
  formationId: string;
  mode: DraftMode;
  completedLeagues: number;
  mmr: number;
  /** The human's manager rating (0–100 quality, for the sim edge); defaults to an average 50. */
  managerRating?: number;
  seed: string;
}): { id: string; managers: ManagerSquad[]; rounds: Fixture[][]; skillBand: string } {
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
    // managerRating is the 0–100 manager-quality used for the sim edge, NOT the cumulative score.
    managerRating: params.managerRating ?? 50,
    completedLeagues: params.completedLeagues,
    injuredPlayerIds: [],
    suspendedPlayerIds: [],
    substitutions: {}
  };

  const usedHistoricalCombos = new Set<string>();
  const reserves = Array.from({ length: 5 }, (_, index) => {
    const bandOffset = skillBand === "rookie" ? -90 : skillBand === "elite" ? 170 : skillBand === "gold" ? 80 : 0;
    return createHistoricalOpponent({
      id: `history-${index + 1}`,
      seed: `${params.seed}:history:${index}`,
      usedCombos: usedHistoricalCombos,
      mmr: Math.max(0, Math.round(params.mmr + bandOffset + (rng() - 0.5) * 90)),
      completedLeagues: skillBand === "rookie" ? Math.floor(rng() * 3) : 3 + Math.floor(rng() * 20),
      managerRating: 45 + Math.round(rng() * 20)
    });
  });

  const managers = [human, ...reserves];
  return {
    id: `league-${Date.now()}-${Math.floor(rng() * 10000)}`,
    managers,
    rounds: buildRoundRobin(managers),
    skillBand
  };
}

export function createHistoricalOpponent(params: {
  id: string;
  seed: string;
  usedCombos?: Set<string>;
  mmr?: number;
  completedLeagues?: number;
  managerRating?: number;
}): ManagerSquad {
  const rng = createRng(params.seed);
  const combos = shuffle(getFootballData().combos, rng);
  const formations = shuffle(FORMATION_LIST, rng);

  for (const [teamCode, year] of combos) {
    const comboKey = `${teamCode}|${year}`;
    if (params.usedCombos?.has(comboKey)) {
      continue;
    }
    for (const formation of formations) {
      try {
        const picks = draftTeamSeasonSquad({
          teamCode,
          year,
          formationId: formation.id,
          seed: `${params.seed}:${comboKey}:${formation.id}`
        });
        params.usedCombos?.add(comboKey);
        return {
          id: params.id,
          displayName: `${getTeamName(teamCode)} ${year}`,
          kind: "reserve",
          source: "historical",
          formationId: formation.id,
          mode: "classic",
          picks,
          mmr: params.mmr ?? 0,
          managerRating: params.managerRating ?? 50,
          completedLeagues: params.completedLeagues ?? 0,
          injuredPlayerIds: [],
          suspendedPlayerIds: [],
          substitutions: {}
        };
      } catch {
        // Try another legal historical squad/formation pairing.
      }
    }
  }

  throw new Error("No historical opponent can fill the required matchday squad.");
}

export function buildRoundRobin(managers: ManagerSquad[]): Fixture[][] {
  const ids = managers.map((manager) => manager.id);
  const fixed = ids[0];
  let rotating = ids.slice(1);
  const rounds: Fixture[][] = [];

  for (let round = 0; round < ids.length - 1; round += 1) {
    const row = [fixed, ...rotating];
    const fixtures: Fixture[] = [];

    for (let index = 0; index < row.length / 2; index += 1) {
      const homeId = index % 2 === round % 2 ? row[index] : row[row.length - 1 - index];
      const awayId = index % 2 === round % 2 ? row[row.length - 1 - index] : row[index];
      fixtures.push({
        id: `r${round + 1}-${homeId}-${awayId}`,
        round: round + 1,
        homeId,
        awayId
      });
    }

    rounds.push(fixtures);
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, rotating.length - 1)];
  }

  return rounds;
}
