import { getFormationWithBench } from "./formations";
import { chooseWeightedCandidate, spinForSlot } from "./data";
import type { DraftMode, DraftPick, FormationSlot, ManagerSquad } from "./types";

export function getDraftSlots(formationId: string): FormationSlot[] {
  return getFormationWithBench(formationId).slots;
}

export function getNextDraftSlot(formationId: string, picks: DraftPick[]): FormationSlot | null {
  const pickedSlotIds = new Set(picks.map((pick) => pick.slotId));
  return getDraftSlots(formationId).find((slot) => !pickedSlotIds.has(slot.id)) ?? null;
}

export function makeDraftPick(params: {
  slot: FormationSlot;
  teamCode: string;
  teamName: string;
  year: number;
  candidate: { player: DraftPick["player"]; fit: number; effectiveRating: number };
}): DraftPick {
  return {
    slotId: params.slot.id,
    slotLabel: params.slot.label,
    target: params.slot.target,
    teamCode: params.teamCode,
    teamName: params.teamName,
    year: params.year,
    player: params.candidate.player,
    fit: params.candidate.fit,
    effectiveRating: params.candidate.effectiveRating
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
  const slots = getDraftSlots(params.formationId);

  slots.forEach((slot, index) => {
    const spin = spinForSlot(slot, usedPlayerIds, `${params.seed}:spin:${index}`);
    const candidate = chooseWeightedCandidate(spin.candidates, `${params.seed}:pick:${index}`);
    usedPlayerIds.add(candidate.player.i);
    picks.push(
      makeDraftPick({
        slot,
        teamCode: spin.teamCode,
        teamName: spin.teamName,
        year: spin.year,
        candidate
      })
    );
  });

  return {
    id: params.id,
    displayName: params.displayName,
    kind: params.id === "human" ? "human" : "reserve",
    formationId: params.formationId,
    mode: params.mode ?? "classic",
    picks,
    mmr: params.mmr ?? 65,
    managerRating: params.mmr ?? 65,
    completedLeagues: params.completedLeagues ?? 0,
    injuredPlayerIds: [],
    suspendedPlayerIds: [],
    substitutions: {}
  };
}
