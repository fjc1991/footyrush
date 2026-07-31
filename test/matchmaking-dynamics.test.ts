import { describe, expect, it } from "vitest";
import { buildMiniLeagueIncidentSchedule } from "@/lib/game/matchmaking";
import { createRng } from "@/lib/game/rng";

describe("Mini League incident arc", () => {
  it("is reproducible and always places one turning point in rounds two to four", () => {
    for (let index = 0; index < 100; index += 1) {
      const seed = `mini-incident-${index}`;
      const first = buildMiniLeagueIncidentSchedule(createRng(seed));
      const repeated = buildMiniLeagueIncidentSchedule(createRng(seed));

      expect(first).toEqual(repeated);
      expect(first.round).toBeGreaterThanOrEqual(1);
      expect(first.round).toBeLessThanOrEqual(3);
      expect(["injury", "redCard"]).toContain(first.kind);
    }
  });

  it("produces both injury and red-card stories across deterministic runs", () => {
    const kinds = new Set(
      Array.from({ length: 100 }, (_, index) =>
        buildMiniLeagueIncidentSchedule(createRng(`mini-story-${index}`)).kind
      )
    );

    expect(kinds).toEqual(new Set(["injury", "redCard"]));
  });
});
