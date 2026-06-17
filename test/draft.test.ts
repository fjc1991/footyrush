import { beforeAll, describe, expect, it } from "vitest";
import rawData from "../data.json";
import { getCandidates, seedFootballData, spinForOpenSlots, spinForSlot } from "@/lib/game/data";
import { BOOST_LIMIT } from "@/lib/game/boosts";
import { autoDraftManager, draftTeamSeasonSquad, getDraftSlots, hasDuplicatePlayers } from "@/lib/game/draft";
import type { FormationSlot, RawFootballData } from "@/lib/game/types";

describe("draft rules", () => {
  beforeAll(() => {
    seedFootballData(rawData as unknown as RawFootballData);
  });

  it("draws legal players for a target slot", () => {
    const slot: FormationSlot = { id: "ST", label: "ST", target: "ST", line: "attack" };
    const candidates = getCandidates("MUN", 2013, slot, new Set());
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((candidate) => candidate.fit > 0)).toBe(true);
  });

  it("auto-redraws until a draw has legal options", () => {
    const slot = getDraftSlots("4-3-3").find((candidate) => candidate.id === "GK");
    expect(slot).toBeDefined();
    const spin = spinForSlot(slot!, new Set(), "stable-gk-spin");
    expect(spin.candidates.length).toBeGreaterThan(0);
    expect(spin.slot.target).toBe("GK");
  });

  it("auto-drafts 11 starters and 5 subs without duplicate player ids", () => {
    const manager = autoDraftManager({
      id: "reserve-test",
      displayName: "Reserve Test",
      formationId: "4-3-3",
      seed: "reserve-test"
    });

    expect(manager.picks).toHaveLength(16);
    expect(hasDuplicatePlayers(manager.picks)).toBe(false);
    expect(manager.picks.filter((pick) => pick.target === "SUB")).toHaveLength(5);
    expect(manager.picks.filter((pick) => pick.target === "SUB").map((pick) => pick.benchRole).sort()).toEqual([
      "ATT",
      "DEF",
      "GK",
      "MID",
      "MID"
    ]);
  });

  it("draws a team-season against all open slots and returns role choices", () => {
    const openSlots = getDraftSlots("4-3-3");
    const spin = spinForOpenSlots(openSlots, new Set(), "flexible-open-spin");

    expect(spin.candidates.length).toBeGreaterThan(0);
    expect(spin.candidates.every((candidate) => candidate.slotOptions.length > 0)).toBe(true);
    expect(spin.candidates.every((candidate) => candidate.slotOptions.every((option) => openSlots.some((slot) => slot.id === option.slotId)))).toBe(true);
  });

  it("builds historical club-season squads with required bench roles and capped active boosts", () => {
    const picks = draftTeamSeasonSquad({
      teamCode: "MCI",
      year: 2023,
      formationId: "4-3-3",
      seed: "mci-2023-historical"
    });

    expect(picks).toHaveLength(16);
    expect(hasDuplicatePlayers(picks)).toBe(false);
    expect(picks.filter((pick) => pick.target === "SUB").map((pick) => pick.benchRole).sort()).toEqual([
      "ATT",
      "DEF",
      "GK",
      "MID",
      "MID"
    ]);
    expect(picks.filter((pick) => pick.boostActive)).toHaveLength(BOOST_LIMIT);
    expect(picks.some((pick) => pick.boost)).toBe(true);
  });
});
