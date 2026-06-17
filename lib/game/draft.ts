import { getFormationWithBench } from "./formations";
import { BOOST_LIMIT, applyBoostToRating } from "./boosts";
import { chooseWeightedCandidate, getCandidates, getTeamName, slotOptionForPlayer, spinForSlot } from "./data";
import type { DraftMode, DraftPick, DraftSlotOption, FormationSlot, ManagerSquad, PlayerBoost } from "./types";

export function getDraftSlots(formationId: string): FormationSlot[] {
  return getFormationWithBench(formationId).slots;
}

export function getOpenDraftSlots(formationId: string, picks: DraftPick[]): FormationSlot[] {
  const pickedSlotIds = new Set(picks.map((pick) => pick.slotId));
  return getDraftSlots(formationId).filter((slot) => !pickedSlotIds.has(slot.id));
}

export function getNextDraftSlot(formationId: string, picks: DraftPick[]): FormationSlot | null {
  return getOpenDraftSlots(formationId, picks)[0] ?? null;
}

export function makeDraftPick(params: {
  slot: FormationSlot;
  teamCode: string;
  teamName: string;
  year: number;
  candidate: {
    player: DraftPick["player"];
    fit: number;
    effectiveRating: number;
    slotOptions?: DraftSlotOption[];
    boost?: PlayerBoost;
  };
  slotOption?: DraftSlotOption;
  boostActive?: boolean;
}): DraftPick {
  const slotOption =
    params.slotOption ??
    params.candidate.slotOptions?.find((option) => option.slotId === params.slot.id) ??
    slotOptionForPlayer(params.candidate.player, params.slot);
  const fit = slotOption?.fit ?? params.candidate.fit;
  const baseEffectiveRating = slotOption?.effectiveRating ?? params.candidate.effectiveRating;
  const boostActive = Boolean(params.boostActive && params.candidate.boost);
  return {
    slotId: params.slot.id,
    slotLabel: params.slot.label,
    target: params.slot.target,
    line: params.slot.line,
    benchRole: params.slot.benchRole,
    roleTarget: slotOption?.roleTarget,
    teamCode: params.teamCode,
    teamName: params.teamName,
    year: params.year,
    player: params.candidate.player,
    fit,
    baseEffectiveRating,
    effectiveRating: applyBoostToRating(baseEffectiveRating, params.candidate.boost, boostActive),
    boost: params.candidate.boost,
    boostActive
  };
}

export function hasDuplicatePlayers(picks: DraftPick[]): boolean {
  const playerIds = picks.map((pick) => pick.player.i);
  return new Set(playerIds).size !== playerIds.length;
}

export function autoDraftManager(params: {
  id: string;
  displayName: string;
  formationId: string;
  mode?: DraftMode;
  seed: string;
  mmr?: number;
  completedLeagues?: number;
}): ManagerSquad {
  const picks: DraftPick[] = [];
  const usedPlayerIds = new Set<number>();
  let activeBoosts = 0;
  const slots = getDraftSlots(params.formationId);

  slots.forEach((slot, index) => {
    const spin = spinForSlot(slot, usedPlayerIds, `${params.seed}:spin:${index}`);
    const candidate = chooseWeightedCandidate(spin.candidates, `${params.seed}:pick:${index}`);
    const boostActive = Boolean(candidate.boost && activeBoosts < BOOST_LIMIT);
    if (boostActive) activeBoosts += 1;
    usedPlayerIds.add(candidate.player.i);
    picks.push(
      makeDraftPick({
        slot,
        teamCode: spin.teamCode,
        teamName: spin.teamName,
        year: spin.year,
        candidate,
        boostActive
      })
    );
  });

  return {
    id: params.id,
    displayName: params.displayName,
    kind: params.id === "human" ? "human" : "reserve",
    source: params.id === "human" ? "human" : "reserve",
    formationId: params.formationId,
    mode: params.mode ?? "classic",
    picks,
    mmr: params.mmr ?? 0,
    managerRating: 50,
    completedLeagues: params.completedLeagues ?? 0,
    injuredPlayerIds: [],
    suspendedPlayerIds: [],
    substitutions: {}
  };
}

export function draftTeamSeasonSquad(params: {
  teamCode: string;
  year: number;
  formationId: string;
  seed: string;
}): DraftPick[] {
  const slots = getDraftSlots(params.formationId);
  const openSlots = [...slots];
  const pickBySlot = new Map<string, DraftPick>();
  const usedPlayerIds = new Set<number>();
  let activeBoosts = 0;
  let step = 0;

  while (openSlots.length > 0) {
    const rankedSlots = openSlots
      .map((slot) => ({
        slot,
        candidates: getCandidates(params.teamCode, params.year, slot, usedPlayerIds)
      }))
      .sort((first, second) => first.candidates.length - second.candidates.length);
    const next = rankedSlots[0];
    if (!next || next.candidates.length === 0) {
      throw new Error(`Cannot build ${params.teamCode} ${params.year}: missing ${next?.slot.label ?? "slot"}.`);
    }

    const candidate = chooseWeightedCandidate(next.candidates, `${params.seed}:team-season:${step}`);
    const slotIndex = openSlots.findIndex((slot) => slot.id === next.slot.id);
    if (slotIndex >= 0) {
      openSlots.splice(slotIndex, 1);
    }

    const boostActive = Boolean(candidate.boost && activeBoosts < BOOST_LIMIT);
    if (boostActive) activeBoosts += 1;
    usedPlayerIds.add(candidate.player.i);
    pickBySlot.set(
      next.slot.id,
      makeDraftPick({
        slot: next.slot,
        teamCode: params.teamCode,
        teamName: getTeamName(params.teamCode),
        year: params.year,
        candidate,
        boostActive
      })
    );
    step += 1;
  }

  return slots.map((slot) => {
    const pick = pickBySlot.get(slot.id);
    if (!pick) {
      throw new Error(`Cannot build ${params.teamCode} ${params.year}: missing ${slot.label}.`);
    }
    return pick;
  });
}
