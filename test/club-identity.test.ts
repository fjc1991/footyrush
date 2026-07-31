import { describe, expect, it } from "vitest";
import {
  CLUB_KIT_STYLES,
  CLUB_PALETTES,
  DEFAULT_CLUB_IDENTITY,
  clubIdentityToTeamVisual,
  clubNameValidationMessage,
  normalizeClubIdentity,
  normalizeClubName,
  requiredClubEntitlements,
  resolveClubEntitlements,
  validateClubIdentity,
  type ClubEntitlementGrant
} from "@/lib/game/club-identity";

const earnedName: ClubEntitlementGrant = {
  entitlement: "club_name_custom",
  source: "achievement",
  sourceRef: "first_campaign"
};

describe("club identity", () => {
  it("uses a neutral controlled default", () => {
    expect(DEFAULT_CLUB_IDENTITY).toEqual({
      clubName: "FootyRush FC",
      paletteId: "footyrush",
      kitStyle: "solid"
    });
    expect(Object.isFrozen(DEFAULT_CLUB_IDENTITY)).toBe(true);
  });

  it("normalizes Unicode and whitespace before validating a club name", () => {
    expect(normalizeClubName("  ＦＣ   Seoul\nUnited  ")).toBe("FC Seoul United");
    expect(clubNameValidationMessage("FC Seoul United")).toBeNull();
    expect(clubNameValidationMessage("A")).toContain("at least 3");
    expect(clubNameValidationMessage("Bad <script> FC")).toContain("Use letters");
    expect(clubNameValidationMessage("X".repeat(25))).toContain("at most 24");
  });

  it("maps only fixed palette and style IDs to a team visual", () => {
    const visual = clubIdentityToTeamVisual({
      clubName: "Seoul United",
      paletteId: "claret_sky",
      kitStyle: "hoops"
    });
    expect(visual).toEqual({
      primary: CLUB_PALETTES.claret_sky.primary,
      secondary: CLUB_PALETTES.claret_sky.secondary,
      text: CLUB_PALETTES.claret_sky.text,
      pattern: CLUB_KIT_STYLES.hoops.pattern
    });
    expect(validateClubIdentity({ clubName: "Valid FC", paletteId: "#fff", kitStyle: "solid" }).valid).toBe(false);
    expect(validateClubIdentity({ clubName: "Valid FC", paletteId: "footyrush", kitStyle: "gradient" }).valid).toBe(false);
  });

  it("requires unlocks only for values that differ from the default", () => {
    expect(requiredClubEntitlements({ ...DEFAULT_CLUB_IDENTITY })).toEqual([]);
    expect(requiredClubEntitlements({
      clubName: "Seoul United",
      paletteId: "red_white",
      kitStyle: "stripes"
    })).toEqual(["club_name_custom", "kit_palette_basic", "kit_style_basic"]);

    const locked = validateClubIdentity({
      clubName: "Seoul United",
      paletteId: "footyrush",
      kitStyle: "solid"
    }, []);
    expect(locked).toMatchObject({ valid: false, missingEntitlements: ["club_name_custom"] });

    const unlocked = validateClubIdentity({
      clubName: "  Seoul   United ",
      paletteId: "footyrush",
      kitStyle: "solid"
    }, [earnedName]);
    expect(unlocked).toMatchObject({
      valid: true,
      value: { clubName: "Seoul United", paletteId: "footyrush", kitStyle: "solid" }
    });
  });

  it("merges independent active entitlement sources without revoking another source", () => {
    const grants: ClubEntitlementGrant[] = [
      earnedName,
      { entitlement: "kit_palette_basic", source: "purchase", sourceRef: "order-1" },
      { entitlement: "kit_style_basic", source: "grant", sourceRef: "launch", active: false }
    ];
    expect([...resolveClubEntitlements(grants)]).toEqual(["club_name_custom", "kit_palette_basic"]);
  });

  it("falls back safely when a cache contains damaged or uncontrolled values", () => {
    expect(normalizeClubIdentity({
      clubName: "Injected FC",
      paletteId: "linear-gradient(red, blue)",
      kitStyle: "solid"
    })).toEqual(DEFAULT_CLUB_IDENTITY);
  });
});
