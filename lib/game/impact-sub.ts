import { applyBoostToRating } from "./boosts";
import { effectiveRating } from "./data";
import { getStarterSlots } from "./formations";
import { createRng } from "./rng";
import type { DraftPick, FormationSlot, ManagerSquad } from "./types";

/** Two uses create decisions without turning every match into the same ritual. */
export const MINILEAGUE_IMPACT_SUB_LIMIT = 2;
export const INVINCIBLE_IMPACT_SUB_LIMIT = 2;

/**
 * The total expected-goal swing is intentionally the same for every tactical role.
 * It matches the old Invincible team-talk bonus: noticeable over many uses, but far
 * too small to guarantee a result in one match.
 */
export const IMPACT_SUB_EXPECTED_GOALS_SWING = 0.18;
export const IMPACT_SUB_MINUTE_START = 58;
export const IMPACT_SUB_MINUTE_END = 68;

export type ImpactSubRole = "attack" | "control" | "protect";

export interface ImpactSubEffect {
  role: ImpactSubRole;
  label: string;
  description: string;
  ownExpectedGoalsModifier: number;
  opponentExpectedGoalsModifier: number;
}

export interface ImpactSubPlan extends ImpactSubEffect {
  playerId: number;
  playerName: string;
  offPlayerId: number;
  offPlayerName: string;
  minute: number;
  targetLine: Exclude<FormationSlot["line"], "keeper" | "bench">;
}

const ROLE_EFFECTS: Record<ImpactSubRole, ImpactSubEffect> = {
  attack: {
    role: "attack",
    label: "Attacking spark",
    description: "Fresh legs to chase a goal. Adds +0.18 attacking threat.",
    ownExpectedGoalsModifier: IMPACT_SUB_EXPECTED_GOALS_SWING,
    opponentExpectedGoalsModifier: 0
  },
  control: {
    role: "control",
    label: "Control the tempo",
    description: "A balanced change that adds +0.09 threat and removes 0.09 from the opposition.",
    ownExpectedGoalsModifier: IMPACT_SUB_EXPECTED_GOALS_SWING / 2,
    opponentExpectedGoalsModifier: -IMPACT_SUB_EXPECTED_GOALS_SWING / 2
  },
  protect: {
    role: "protect",
    label: "Protect the result",
    description: "A defensive change that removes 0.18 attacking threat from the opposition.",
    ownExpectedGoalsModifier: 0,
    opponentExpectedGoalsModifier: -IMPACT_SUB_EXPECTED_GOALS_SWING
  }
};

function unavailablePlayerIds(manager: ManagerSquad): Set<number> {
  return new Set([...manager.injuredPlayerIds, ...manager.suspendedPlayerIds]);
}

interface ResolvedLineupEntry {
  slot: FormationSlot;
  pick: DraftPick | null;
  rating: number;
}

function resolvedActiveLineup(manager: ManagerSquad): ResolvedLineupEntry[] {
  const unavailable = unavailablePlayerIds(manager);
  const usedReplacementIds = new Set<number>();
  return getStarterSlots(manager.formationId).map((slot) => {
    const starter = manager.picks.find((pick) => pick.slotId === slot.id);
    if (!starter) return { slot, pick: null, rating: 0 };
    if (!unavailable.has(starter.player.i)) {
      return { slot, pick: starter, rating: starter.effectiveRating };
    }

    const chosenId = manager.substitutions[starter.player.i];
    const chosen = manager.picks.find(
      (pick) =>
        pick.player.i === chosenId &&
        pick.target === "SUB" &&
        !unavailable.has(pick.player.i) &&
        !usedReplacementIds.has(pick.player.i)
    );
    const automatic = manager.picks
      .filter(
        (pick) =>
          pick.target === "SUB" &&
          !unavailable.has(pick.player.i) &&
          !usedReplacementIds.has(pick.player.i)
      )
      .map((pick) => ({
        pick,
        rating: applyBoostToRating(
          effectiveRating(pick.player, slot.target),
          pick.boost,
          pick.boostActive
        )
      }))
      .filter((entry) => entry.rating > 0)
      .sort((first, second) => second.rating - first.rating)[0];
    const replacement = chosen
      ? {
          pick: chosen,
          rating: applyBoostToRating(
            effectiveRating(chosen.player, slot.target),
            chosen.boost,
            chosen.boostActive
          )
        }
      : automatic;
    if (!replacement) return { slot, pick: null, rating: 0 };
    usedReplacementIds.add(replacement.pick.player.i);
    return {
      slot,
      pick: replacement.pick,
      rating: replacement.rating - 2
    };
  });
}

function impactRoleForPick(pick: DraftPick): ImpactSubRole | null {
  if (pick.benchRole === "ATT") return "attack";
  if (pick.benchRole === "MID") return "control";
  if (pick.benchRole === "DEF") return "protect";
  return null;
}

export function impactSubEffectForPick(pick: DraftPick): ImpactSubEffect | null {
  const role = impactRoleForPick(pick);
  return role ? ROLE_EFFECTS[role] : null;
}

/**
 * Healthy outfield bench players can be primed as the impact sub. A player who is
 * already replacing an absent starter is on the pitch, so is not offered again.
 */
export function availableImpactSubs(manager: ManagerSquad): DraftPick[] {
  const unavailable = unavailablePlayerIds(manager);
  const activePlayerIds = new Set(
    resolvedActiveLineup(manager).flatMap((entry) =>
      entry.pick ? [entry.pick.player.i] : []
    )
  );

  return manager.picks.filter(
    (pick) =>
      pick.target === "SUB" &&
      pick.benchRole !== "GK" &&
      impactRoleForPick(pick) !== null &&
      !unavailable.has(pick.player.i) &&
      !activePlayerIds.has(pick.player.i)
  );
}

function targetLineForRole(role: ImpactSubRole): ImpactSubPlan["targetLine"] {
  if (role === "attack") return "attack";
  if (role === "control") return "midfield";
  return "defense";
}

/**
 * Resolve a user selection into a deterministic match plan. The lowest-rated
 * available starter in the same tactical line makes way, which keeps the choice
 * legible and avoids quietly removing the user's star player.
 */
export function createImpactSubPlan(params: {
  manager: ManagerSquad;
  playerId: number | null | undefined;
  seed: string;
}): ImpactSubPlan | null {
  if (params.playerId == null) return null;
  const selected = availableImpactSubs(params.manager).find(
    (pick) => pick.player.i === params.playerId
  );
  if (!selected) return null;

  const effect = impactSubEffectForPick(selected);
  if (!effect) return null;
  const targetLine = targetLineForRole(effect.role);
  const compatibleStarters = resolvedActiveLineup(params.manager)
    .filter((entry) => entry.slot.line === targetLine)
    .filter(
      (entry): entry is ResolvedLineupEntry & { pick: DraftPick } =>
        entry.pick !== null
    )
    .sort(
      (first, second) =>
        first.rating - second.rating ||
        first.pick.player.i - second.pick.player.i
    );
  const off = compatibleStarters[0]?.pick;
  if (!off) return null;

  const rng = createRng(`${params.seed}:${params.manager.id}:${selected.player.i}`);
  const minute =
    IMPACT_SUB_MINUTE_START +
    Math.floor(rng() * (IMPACT_SUB_MINUTE_END - IMPACT_SUB_MINUTE_START + 1));

  return {
    ...effect,
    playerId: selected.player.i,
    playerName: selected.player.n,
    offPlayerId: off.player.i,
    offPlayerName: off.player.n,
    minute,
    targetLine
  };
}

export function remainingImpactSubs(used: number, limit: number): number {
  return Math.max(0, Math.floor(limit) - Math.max(0, Math.floor(used)));
}
