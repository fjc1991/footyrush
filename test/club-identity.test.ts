import { describe, expect, it } from "vitest";
import {
  CLUB_BADGE_STYLES,
  CLUB_KIT_STYLES,
  CLUB_PALETTES,
  DEFAULT_CLUB_IDENTITY,
  applyClubEntitlements,
  clubBadgeClipPath,
  clubIdentityToTeamVisual,
  clubNameValidationMessage,
  mergeEntitledClubIdentity,
  normalizeClubIdentity,
  normalizeClubName,
  requiredClubEntitlements,
  resolveClubEntitlements,
  validateClubIdentity,
  type ClubEntitlementGrant,
  type ClubIdentity
} from "@/lib/game/club-identity";

const earnedName: ClubEntitlementGrant = {
  entitlement: "club_name_custom",
  source: "unlock",
  sourceRef: "club_identity"
};

const customIdentity: ClubIdentity = {
  clubName: "Seoul United",
  paletteId: "claret_sky",
  kitStyle: "hoops",
  badgeStyle: "round",
  editionId: "supporter"
};

describe("club identity", () => {
  it("uses a neutral controlled default", () => {
    expect(DEFAULT_CLUB_IDENTITY).toEqual({
      clubName: "FootyRush FC",
      paletteId: "footyrush",
      kitStyle: "solid",
      badgeStyle: "shield",
      editionId: "standard"
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

  it("maps fixed palette, kit and badge IDs without accepting CSS input", () => {
    const visual = clubIdentityToTeamVisual(customIdentity);
    expect(visual).toEqual({
      primary: CLUB_PALETTES.claret_sky.primary,
      secondary: CLUB_PALETTES.claret_sky.secondary,
      text: CLUB_PALETTES.claret_sky.text,
      pattern: CLUB_KIT_STYLES.hoops.pattern
    });
    expect(clubBadgeClipPath(customIdentity)).toBe(CLUB_BADGE_STYLES.round.clipPath);
    expect(validateClubIdentity({ ...customIdentity, paletteId: "#fff" }).valid).toBe(false);
    expect(validateClubIdentity({ ...customIdentity, kitStyle: "gradient" }).valid).toBe(false);
    expect(validateClubIdentity({ ...customIdentity, badgeStyle: "url(evil)" }).valid).toBe(false);
  });

  it("requires a distinct entitlement for every non-default field", () => {
    expect(requiredClubEntitlements({ ...DEFAULT_CLUB_IDENTITY })).toEqual([]);
    expect(requiredClubEntitlements(customIdentity)).toEqual([
      "club_name_custom",
      "kit_style_basic",
      "badge_style_basic",
      "supporter_edition"
    ]);

    const locked = validateClubIdentity(customIdentity, []);
    expect(locked).toMatchObject({
      valid: false,
      missingEntitlements: [
        "club_name_custom",
        "kit_style_basic",
        "badge_style_basic",
        "supporter_edition"
      ]
    });
  });

  it("clamps each locked field independently instead of resetting the whole identity", () => {
    expect(applyClubEntitlements(customIdentity, [earnedName])).toEqual({
      ...DEFAULT_CLUB_IDENTITY,
      clubName: "Seoul United"
    });
    expect(applyClubEntitlements(customIdentity, [{
      entitlement: "badge_style_basic",
      source: "unlock",
      sourceRef: "badge_heritage"
    }])).toEqual({
      ...DEFAULT_CLUB_IDENTITY,
      badgeStyle: "round"
    });
    expect(applyClubEntitlements(customIdentity, [{
      entitlement: "supporter_edition",
      source: "purchase",
      sourceRef: "checkout-1"
    }])).toEqual({
      ...DEFAULT_CLUB_IDENTITY,
      paletteId: "claret_sky",
      editionId: "supporter"
    });
  });

  it("lets a supporter choose colours without skipping the standard palette path", () => {
    const supporterGrant: ClubEntitlementGrant = {
      entitlement: "supporter_edition",
      source: "purchase",
      sourceRef: "checkout-1"
    };
    const supporterColours: ClubIdentity = {
      ...DEFAULT_CLUB_IDENTITY,
      paletteId: "green_white",
      editionId: "supporter"
    };
    expect(validateClubIdentity(supporterColours, [supporterGrant])).toMatchObject({ valid: true });
    expect(applyClubEntitlements(supporterColours, [supporterGrant])).toEqual(supporterColours);
    expect(applyClubEntitlements({ ...supporterColours, editionId: "standard" }, [supporterGrant])).toEqual(
      DEFAULT_CLUB_IDENTITY
    );
  });

  it("preserves dormant selections when editing one earned field", () => {
    const edited = { ...DEFAULT_CLUB_IDENTITY, clubName: "Busan Rush" };
    expect(mergeEntitledClubIdentity(customIdentity, edited, [earnedName])).toEqual({
      ...customIdentity,
      clubName: "Busan Rush"
    });
  });

  it("merges independent active entitlement sources without revoking another source", () => {
    const grants: ClubEntitlementGrant[] = [
      earnedName,
      { entitlement: "kit_palette_basic", source: "purchase", sourceRef: "order-1" },
      { entitlement: "kit_style_basic", source: "grant", sourceRef: "launch", active: false },
      { entitlement: "supporter_edition", source: "purchase", sourceRef: "checkout-1" }
    ];
    expect([...resolveClubEntitlements(grants)]).toEqual([
      "club_name_custom",
      "kit_palette_basic",
      "supporter_edition"
    ]);
  });

  it("materializes single-use grant iterables before checking multiple fields", () => {
    function* grants(): Generator<ClubEntitlementGrant> {
      yield earnedName;
      yield { entitlement: "kit_palette_basic", source: "unlock", sourceRef: "club_colours" };
      yield { entitlement: "supporter_edition", source: "purchase", sourceRef: "checkout-1" };
    }
    expect(applyClubEntitlements(customIdentity, grants())).toEqual({
      ...DEFAULT_CLUB_IDENTITY,
      clubName: "Seoul United",
      paletteId: "claret_sky",
      editionId: "supporter"
    });
  });

  it("migrates v1 caches with safe badge and edition defaults", () => {
    expect(normalizeClubIdentity({
      clubName: "Legacy FC",
      paletteId: "royal_gold",
      kitStyle: "stripes"
    })).toEqual({
      clubName: "Legacy FC",
      paletteId: "royal_gold",
      kitStyle: "stripes",
      badgeStyle: "shield",
      editionId: "standard"
    });
  });

  it("falls back safely when a cache contains damaged or uncontrolled values", () => {
    expect(normalizeClubIdentity({
      ...customIdentity,
      paletteId: "linear-gradient(red, blue)"
    })).toEqual(DEFAULT_CLUB_IDENTITY);
  });
});
