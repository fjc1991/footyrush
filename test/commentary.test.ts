import { describe, expect, it } from "vitest";
import { renderCommentary } from "@/lib/game/commentary";
import type { MatchEvent } from "@/lib/game/types";

describe("Impact Sub commentary", () => {
  const event: MatchEvent = {
    id: "impact-story",
    second: 64,
    code: "substitution",
    teamId: "human",
    playerId: 12,
    playerName: "Fresh Forward",
    params: {
      manager: "FootyRush FC",
      off: "Starting Striker",
      impactSub: 1,
      impactLabel: "Attacking spark"
    }
  };

  it("describes a tactical call without implying an injury", () => {
    const line = renderCommentary(event, "en");

    expect(line).toContain("Impact Sub");
    expect(line).toContain("Fresh Forward");
    expect(line).toContain("Attacking spark");
    expect(line.toLowerCase()).not.toContain("limp");
  });

  it("keeps the special call in supported locales", () => {
    expect(renderCommentary(event, "es")).toContain("Cambio de impacto");
    expect(renderCommentary(event, "fr")).toContain("Impact Sub");
    expect(renderCommentary(event, "pt")).toContain("Substituição de impacto");
  });
});
