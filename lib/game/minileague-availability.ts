import { applyFixtureInjuries } from "./simulation";
import type { FixtureResult, ManagerSquad } from "./types";

/**
 * Advance Mini League availability after every fixture in a round has finished.
 *
 * Suspensions present on entry were served during the completed round, so they
 * clear before this round's red cards are applied. Mini League injuries have no
 * recovery timer and therefore remain unavailable for subsequent rounds.
 */
export function advanceMiniLeagueAvailability(
  managers: readonly ManagerSquad[],
  roundResults: readonly FixtureResult[]
): ManagerSquad[] {
  let nextManagers = managers.map((manager) =>
    manager.suspendedPlayerIds.length === 0
      ? manager
      : {
          ...manager,
          suspendedPlayerIds: []
        }
  );

  for (const result of roundResults) {
    nextManagers = applyFixtureInjuries(nextManagers, result);
  }

  return nextManagers;
}
