import { describe, expect, it } from "vitest";
import sourceData from "../data.json";
import publicData from "../public/data.json";
import { effectiveRating } from "@/lib/game/data";
import type { RawFootballData } from "@/lib/game/types";

function arsenalMartinelli(data: RawFootballData) {
  const player = data.squads["ARS|2026"]?.find(
    (candidate) => candidate.n === "Gabriel Martinelli"
  );
  if (!player) throw new Error("ARS 2026 Gabriel Martinelli is missing from football data.");
  return player;
}

describe("player rating regressions", () => {
  it("keeps Martinelli at least eight points below his former Arsenal 2026 rating", () => {
    const source = arsenalMartinelli(sourceData as unknown as RawFootballData);
    const publicPlayer = arsenalMartinelli(publicData as unknown as RawFootballData);

    expect(source.o).toBe(82);
    expect(Math.round(effectiveRating(source, "LW"))).toBe(83);
    expect(publicPlayer).toEqual(source);
  });
});
