import { describe, expect, it } from "vitest";
import rawData from "../data.json";
import {
  getTeamMonogram,
  getTeamPatternBackground,
  getTeamVisual,
  getTeamVisualStyle,
  TEAM_CODES,
  TEAM_VISUALS
} from "@/lib/game/team-visuals";

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
});
