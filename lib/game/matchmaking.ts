import { autoDraftManager } from "./draft";
import { FORMATION_LIST } from "./formations";
import { createRng, pickOne } from "./rng";
import type { DraftMode, DraftPick, Fixture, ManagerSquad } from "./types";

const reserveNames = [
  "Harbour Athletic",
  "Northbank 98",
  "Canal End FC",
  "Sunday Press",
  "Tactical Dad",
  "The Low Block",
  "Set Piece Union",
  "Mersey Arcade",
  "Old Boot Room",
  "Five Yard Pass"
];

export function getSkillBand(completedLeagues: number, mmr: number): string {
  if (completedLeagues < 3) {
    return "rookie";
  }
  if (mmr < 900) {
    return "bronze";
  }
  if (mmr < 1100) {
    return "silver";
  }
  if (mmr < 1300) {
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
  /** The human's chosen manager rating; falls back to mmr if not provided. */
  managerRating?: number;
  seed: string;
}): { id: string; managers: ManagerSquad[]; rounds: Fixture[][]; skillBand: string } {
  const rng = createRng(params.seed);
  const skillBand = getSkillBand(params.completedLeagues, params.mmr);
  const human: ManagerSquad = {
    id: "human",
    displayName: params.humanName,
    kind: "human",
    formationId: params.formationId,
    mode: params.mode,
    picks: params.humanPicks,
    mmr: params.mmr,
    managerRating: params.managerRating ?? params.mmr,
    completedLeagues: params.completedLeagues,
    injuredPlayerIds: [],
    suspendedPlayerIds: [],
    substitutions: {}
  };

  const reserves = Array.from({ length: 5 }, (_, index) => {
    const formation = pickOne(FORMATION_LIST, rng).id;
    const bandOffset = skillBand === "rookie" ? -90 : skillBand === "elite" ? 170 : skillBand === "gold" ? 80 : 0;
    return autoDraftManager({
      id: `reserve-${index + 1}`,
      displayName: reserveNames[(index + Math.floor(rng() * reserveNames.length)) % reserveNames.length],
      formationId: formation,
      seed: `${params.seed}:reserve:${index}`,
      mmr: Math.round(params.mmr + bandOffset + (rng() - 0.5) * 90),
      completedLeagues: skillBand === "rookie" ? Math.floor(rng() * 3) : 3 + Math.floor(rng() * 20)
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
