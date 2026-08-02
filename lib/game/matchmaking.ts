import { draftTeamSeasonSquad } from "./draft";
import { getFootballData, getTeamName } from "./data";
import { FORMATION_LIST } from "./formations";
import { createRng, shuffle } from "./rng";
import type { ClubIdentity } from "./club-identity";
import type { DraftMode, DraftPick, Fixture, ManagerSquad, SeasonCasualtyKind } from "./types";

export interface MiniLeagueIncidentSchedule {
  /** Zero-based round index. The finale stays clear so the table, not an interruption, owns the ending. */
  round: number;
  kind: SeasonCasualtyKind;
}

export type SkillBand = "rookie" | "bronze" | "silver" | "gold" | "elite";

export const SKILL_BAND_MANAGER_OFFSETS: Readonly<Record<SkillBand, number>> = Object.freeze({
  rookie: -10,
  bronze: -5,
  silver: 0,
  gold: 8,
  elite: 15
});

export function getSkillBand(completedLeagues: number, mmr: number): SkillBand {
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

/**
 * Skill bands should change the football, not just the label. Reuse the
 * simulation's existing manager-quality channel so harder opponents make
 * better use of the same historical squads without inventing hidden ratings.
 */
export function opponentManagerRatingForBand(baseRating: number, band: SkillBand): number {
  return Math.max(25, Math.min(90, Math.round(baseRating) + SKILL_BAND_MANAGER_OFFSETS[band]));
}

export function createMinileague(params: {
  humanPicks: DraftPick[];
  humanName: string;
  humanClubIdentity?: ClubIdentity;
  formationId: string;
  mode: DraftMode;
  completedLeagues: number;
  mmr: number;
  /** The human's manager rating (0–100 quality, for the sim edge); defaults to an average 50. */
  managerRating?: number;
  seed: string;
}): {
  id: string;
  managers: ManagerSquad[];
  rounds: Fixture[][];
  skillBand: SkillBand;
  incidentSchedule: MiniLeagueIncidentSchedule;
} {
  const rng = createRng(params.seed);
  const skillBand = getSkillBand(params.completedLeagues, params.mmr);
  const human: ManagerSquad = {
    id: "human",
    displayName: params.humanClubIdentity?.clubName ?? params.humanName,
    clubIdentity: params.humanClubIdentity,
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
      managerRating: opponentManagerRatingForBand(45 + Math.round(rng() * 20), skillBand)
    });
  });

  const managers = [human, ...reserves];
  return {
    id: `league-${Date.now()}-${Math.floor(rng() * 10000)}`,
    managers,
    rounds: buildRoundRobin(managers),
    skillBand,
    incidentSchedule: buildMiniLeagueIncidentSchedule(
      createRng(`${params.seed}:mini-incident`)
    )
  };
}

/**
 * A five-match run always gets one human turning point in rounds 2–4. Natural
 * match incidents can still happen elsewhere, but the seeded beat prevents a
 * whole league from passing without a lineup consequence.
 */
export function buildMiniLeagueIncidentSchedule(
  rng: () => number
): MiniLeagueIncidentSchedule {
  return {
    round: 1 + Math.floor(rng() * 3),
    kind: rng() < 0.65 ? "injury" : "redCard"
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
