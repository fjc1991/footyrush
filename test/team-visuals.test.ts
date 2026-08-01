import { describe, expect, it } from "vitest";
import rawData from "../data.json";
import {
  getTeamMonogram,
  getTeamPatternBackground,
  getTeamVisual,
  getTeamVisualStyle,
  resolveManagerIdentity,
  TEAM_CODES,
  TEAM_VISUALS
} from "@/lib/game/team-visuals";
import type { ManagerSquad } from "@/lib/game/types";

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrast(first: string, second: string): number {
  const high = Math.max(luminance(first), luminance(second));
  const low = Math.min(luminance(first), luminance(second));
  return (high + 0.05) / (low + 0.05);
}

function manager(
  teamCodes: string[],
  overrides: Partial<ManagerSquad> = {}
): ManagerSquad {
  return {
    id: "manager-visual-test",
    displayName: "Manager Visual Test",
    kind: "reserve",
    formationId: "4-3-3",
    mode: "classic",
    picks: teamCodes.map((teamCode, index) => ({
      teamCode,
      target: index === teamCodes.length - 1 ? "SUB" : "CM"
    })) as ManagerSquad["picks"],
    mmr: 0,
    managerRating: 50,
    completedLeagues: 0,
    injuredPlayerIds: [],
    suspendedPlayerIds: [],
    substitutions: {},
    ...overrides
  };
}

describe("team visuals", () => {
  it("covers every team code in the football dataset", () => {
    expect([...TEAM_CODES].sort()).toEqual(Object.keys(rawData.teams).sort());
    expect(Object.keys(TEAM_VISUALS)).toHaveLength(36);
  });

  it("uses valid, distinct colours with accessible badge text", () => {
    for (const visual of Object.values(TEAM_VISUALS)) {
      expect(visual.primary).toMatch(/^#[0-9A-F]{6}$/);
      expect(visual.secondary).toMatch(/^#[0-9A-F]{6}$/);
      expect(visual.primary).not.toBe(visual.secondary);
      expect(contrast(visual.primary, visual.text)).toBeGreaterThanOrEqual(4.5);
      expect(getTeamPatternBackground(visual)).toContain(visual.primary);
    }
  });

  it("keeps representative club colours and traditional patterns", () => {
    expect(TEAM_VISUALS.ARS).toMatchObject({
      primary: "#C8102E",
      secondary: "#F5F7FA",
      pattern: "sleeves"
    });
    expect(TEAM_VISUALS.CRY).toMatchObject({
      primary: "#1B458F",
      secondary: "#C4122E",
      pattern: "stripes"
    });
    expect(TEAM_VISUALS.WAT).toMatchObject({
      primary: "#F4D600",
      secondary: "#111820"
    });
    expect(TEAM_VISUALS.BLB).toMatchObject({
      primary: "#1675D1",
      secondary: "#F5F7FA",
      pattern: "halves"
    });
    expect(getTeamPatternBackground(TEAM_VISUALS.ARS)).toContain("24%");
  });

  it("returns a deterministic accessible fallback for unknown codes", () => {
    const first = getTeamVisual("xyz");
    const repeat = getTeamVisual(" XYZ ");
    expect(first).toEqual(repeat);
    expect(contrast(first.primary, first.text)).toBeGreaterThanOrEqual(4.5);
    expect(getTeamVisualStyle("xyz")).toMatchObject({
      "--team-primary": first.primary,
      "--team-secondary": first.secondary,
      "--team-ink": first.text
    });
  });

  it("builds compact, safe monograms", () => {
    expect(getTeamMonogram("mun")).toBe("MUN");
    expect(getTeamMonogram("", "Example Athletic Club")).toBe("EAC");
    expect(getTeamMonogram("!!")).toBe("FR");
  });

  it("resolves a custom human club independently of pick order", () => {
    const clubIdentity = {
      clubName: "Northbank Athletic",
      paletteId: "royal_gold" as const,
      kitStyle: "stripes" as const,
      badgeStyle: "round" as const,
      editionId: "standard" as const
    };
    const first = resolveManagerIdentity(manager(["ARS", "CHE", "LIV"], {
      id: "human",
      displayName: "@northbank",
      kind: "human",
      source: "human",
      clubIdentity
    }));
    const reordered = resolveManagerIdentity(manager(["LIV", "ARS", "CHE"], {
      id: "human",
      displayName: "@northbank",
      kind: "human",
      source: "human",
      clubIdentity
    }));

    expect(reordered).toEqual(first);
    expect(first).toMatchObject({
      clubName: "Northbank Athletic",
      monogram: "NA",
      teamCode: null,
      visual: { primary: "#1849A9", secondary: "#F5C400", pattern: "stripes" },
      badgeClipPath: "circle(50% at 50% 50%)",
      supporter: false
    });
    expect(first.style).toEqual(getTeamVisualStyle(first.visual));
  });

  it("marks a paid edition as supporter-owned without changing its chosen colours", () => {
    const resolved = resolveManagerIdentity(manager(["ARS", "CHE"], {
      id: "human",
      kind: "human",
      source: "human",
      clubIdentity: {
        clubName: "Supporter FC",
        paletteId: "green_white",
        kitStyle: "halves",
        badgeStyle: "hexagon",
        editionId: "supporter"
      }
    }));

    expect(resolved).toMatchObject({
      clubName: "Supporter FC",
      supporter: true,
      visual: { primary: "#08783D", secondary: "#F5F7FA", pattern: "halves" }
    });
    expect(resolved.badgeClipPath).toContain("polygon");
  });

  it("preserves a historical club identity when its picks are reordered", () => {
    const first = resolveManagerIdentity(manager(["BLB", "BLB", "BLB"], {
      id: "history-1",
      displayName: "Blackburn Rovers 1994–95",
      source: "historical"
    }));
    const reordered = resolveManagerIdentity(manager(["BLB", "BLB", "BLB"].reverse(), {
      id: "history-1",
      displayName: "Blackburn Rovers 1994–95",
      source: "historical"
    }));

    expect(reordered).toEqual(first);
    expect(first).toMatchObject({
      clubName: "Blackburn Rovers 1994–95",
      monogram: "BLB",
      teamCode: "BLB",
      visual: TEAM_VISUALS.BLB
    });
  });

  it("does not let pick order define a mixed legacy squad's identity", () => {
    const first = resolveManagerIdentity(manager(["ARS", "CHE"], {
      id: "mixed-community",
      displayName: "Mixed Community XI"
    }));
    const reordered = resolveManagerIdentity(manager(["CHE", "ARS"], {
      id: "mixed-community",
      displayName: "Mixed Community XI"
    }));

    expect(reordered).toEqual(first);
    expect(first.teamCode).toBeNull();
    expect(first.monogram).toBe("MCX");
    expect(first.visual).toEqual(getTeamVisual("mixed-community"));
  });
});
