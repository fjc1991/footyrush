import { describe, expect, it } from "vitest";
import {
  invincibleMilestoneKind,
  miniLeagueMilestoneKind
} from "@/lib/game/milestones";

describe("milestone sharing nudges", () => {
  it("prioritizes a league title over other Mini League milestones", () => {
    expect(
      miniLeagueMilestoneKind({
        wonTitle: true,
        unlockedExpert: true,
        completedLeagues: 5
      })
    ).toBe("league_champion");
  });

  it("nudges for Expert unlocks and selected run landmarks only", () => {
    expect(
      miniLeagueMilestoneKind({
        wonTitle: false,
        unlockedExpert: true,
        completedLeagues: 3
      })
    ).toBe("expert_unlocked");
    expect(
      miniLeagueMilestoneKind({
        wonTitle: false,
        unlockedExpert: false,
        completedLeagues: 10
      })
    ).toBe("run_landmark");
    expect(
      miniLeagueMilestoneKind({
        wonTitle: false,
        unlockedExpert: false,
        completedLeagues: 11
      })
    ).toBeNull();
  });

  it("prioritizes unbeaten Invincible seasons, then league titles", () => {
    expect(invincibleMilestoneKind({ unbeaten: true, finalPosition: 2 })).toBe("unbeaten");
    expect(invincibleMilestoneKind({ unbeaten: false, finalPosition: 1 })).toBe("league_champion");
    expect(invincibleMilestoneKind({ unbeaten: false, finalPosition: 4 })).toBeNull();
  });
});
