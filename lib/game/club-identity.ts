import type { TeamPattern, TeamVisual } from "./team-visuals";

export const MIN_CLUB_NAME_LENGTH = 3;
export const MAX_CLUB_NAME_LENGTH = 24;

export const CLUB_PALETTES = {
  footyrush: {
    label: "FootyRush",
    primary: "#12304B",
    secondary: "#36CBE8",
    text: "#FFFFFF"
  },
  red_white: {
    label: "Red & white",
    primary: "#C8102E",
    secondary: "#F5F7FA",
    text: "#FFFFFF"
  },
  royal_gold: {
    label: "Royal & gold",
    primary: "#1849A9",
    secondary: "#F5C400",
    text: "#FFFFFF"
  },
  claret_sky: {
    label: "Claret & sky",
    primary: "#6C1D45",
    secondary: "#79BDE8",
    text: "#FFFFFF"
  },
  green_white: {
    label: "Green & white",
    primary: "#08783D",
    secondary: "#F5F7FA",
    text: "#FFFFFF"
  },
  black_amber: {
    label: "Black & amber",
    primary: "#111820",
    secondary: "#FDB913",
    text: "#FFFFFF"
  }
} as const satisfies Record<string, Omit<TeamVisual, "pattern"> & { label: string }>;

export const CLUB_KIT_STYLES = {
  solid: { label: "Solid", pattern: "solid" },
  stripes: { label: "Stripes", pattern: "stripes" },
  halves: { label: "Halves", pattern: "halves" },
  hoops: { label: "Hoops", pattern: "hoops" }
} as const satisfies Record<string, { label: string; pattern: TeamPattern }>;

export const CLUB_BADGE_STYLES = {
  shield: {
    label: "Shield",
    clipPath: "polygon(12% 0, 88% 0, 100% 18%, 92% 76%, 50% 100%, 8% 76%, 0 18%)"
  },
  round: {
    label: "Roundel",
    clipPath: "circle(50% at 50% 50%)"
  },
  diamond: {
    label: "Diamond",
    clipPath: "polygon(50% 0, 96% 50%, 50% 100%, 4% 50%)"
  },
  hexagon: {
    label: "Hexagon",
    clipPath: "polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)"
  }
} as const satisfies Record<string, { label: string; clipPath: string }>;

export const CLUB_EDITIONS = {
  standard: { label: "Standard" },
  supporter: { label: "Supporter Edition" }
} as const;

export type ClubPaletteId = keyof typeof CLUB_PALETTES;
export type ClubKitStyleId = keyof typeof CLUB_KIT_STYLES;
export type ClubBadgeStyleId = keyof typeof CLUB_BADGE_STYLES;
export type ClubEditionId = keyof typeof CLUB_EDITIONS;

export interface ClubIdentity {
  clubName: string;
  paletteId: ClubPaletteId;
  kitStyle: ClubKitStyleId;
  badgeStyle: ClubBadgeStyleId;
  editionId: ClubEditionId;
}

export const DEFAULT_CLUB_IDENTITY: Readonly<ClubIdentity> = Object.freeze({
  clubName: "FootyRush FC",
  paletteId: "footyrush",
  kitStyle: "solid",
  badgeStyle: "shield",
  editionId: "standard"
});

export type ClubEntitlement =
  | "club_name_custom"
  | "kit_palette_basic"
  | "kit_style_basic"
  | "badge_style_basic"
  | "supporter_edition";

/**
 * One independently revocable reason that an account may use a customization.
 * Gameplay unlock, purchase and administrator grants can therefore coexist without
 * one source accidentally removing another.
 */
export interface ClubEntitlementGrant {
  entitlement: ClubEntitlement;
  source: string;
  sourceRef: string;
  active?: boolean;
}

export interface ClubIdentityValidation {
  valid: boolean;
  value?: ClubIdentity;
  errors: string[];
  missingEntitlements: ClubEntitlement[];
}

const clubNamePattern = /^[\p{L}\p{N}](?:[\p{L}\p{N} '&.’.-]*[\p{L}\p{N}])?$/u;

export function normalizeClubName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

export function clubNameValidationMessage(value: unknown): string | null {
  const normalized = normalizeClubName(value);
  if (normalized.length < MIN_CLUB_NAME_LENGTH) {
    return `Club names need at least ${MIN_CLUB_NAME_LENGTH} characters.`;
  }
  if (normalized.length > MAX_CLUB_NAME_LENGTH) {
    return `Club names can contain at most ${MAX_CLUB_NAME_LENGTH} characters.`;
  }
  if (!clubNamePattern.test(normalized)) {
    return "Use letters, numbers, spaces, apostrophes, ampersands, full stops or hyphens.";
  }
  return null;
}

export function isClubPaletteId(value: unknown): value is ClubPaletteId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CLUB_PALETTES, value);
}

export function isClubKitStyleId(value: unknown): value is ClubKitStyleId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CLUB_KIT_STYLES, value);
}

export function isClubBadgeStyleId(value: unknown): value is ClubBadgeStyleId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CLUB_BADGE_STYLES, value);
}

export function isClubEditionId(value: unknown): value is ClubEditionId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CLUB_EDITIONS, value);
}

/** Convert the persisted controlled IDs into the visual shape used by badges and kits. */
export function clubIdentityToTeamVisual(identity: ClubIdentity): TeamVisual {
  const palette = CLUB_PALETTES[identity.paletteId];
  const style = CLUB_KIT_STYLES[identity.kitStyle];
  return {
    primary: palette.primary,
    secondary: palette.secondary,
    text: palette.text,
    pattern: style.pattern
  };
}

export function clubBadgeClipPath(identity: Pick<ClubIdentity, "badgeStyle">): string {
  return CLUB_BADGE_STYLES[identity.badgeStyle].clipPath;
}

/**
 * Merge all active grant sources. Callers may append future purchase or admin
 * grants to earned gameplay grants without changing the unlock checks.
 */
export function resolveClubEntitlements(
  grants: Iterable<ClubEntitlementGrant>
): ReadonlySet<ClubEntitlement> {
  const resolved = new Set<ClubEntitlement>();
  for (const grant of grants) {
    if (grant.active !== false) resolved.add(grant.entitlement);
  }
  return resolved;
}

export function hasClubEntitlement(
  grants: Iterable<ClubEntitlementGrant>,
  entitlement: ClubEntitlement
): boolean {
  for (const grant of grants) {
    if (grant.entitlement === entitlement && grant.active !== false) return true;
  }
  return false;
}

export function requiredClubEntitlements(identity: ClubIdentity): ClubEntitlement[] {
  const required: ClubEntitlement[] = [];
  const supporterEdition = identity.editionId === "supporter";
  if (normalizeClubName(identity.clubName) !== DEFAULT_CLUB_IDENTITY.clubName) {
    required.push("club_name_custom");
  }
  // Supporter Edition includes colour freedom for its own kit and badge. The
  // standard edition still needs the independent career-goals palette unlock.
  if (identity.paletteId !== DEFAULT_CLUB_IDENTITY.paletteId && !supporterEdition) {
    required.push("kit_palette_basic");
  }
  if (identity.kitStyle !== DEFAULT_CLUB_IDENTITY.kitStyle) {
    required.push("kit_style_basic");
  }
  if (identity.badgeStyle !== DEFAULT_CLUB_IDENTITY.badgeStyle) {
    required.push("badge_style_basic");
  }
  if (supporterEdition) {
    required.push("supporter_edition");
  }
  return required;
}

/**
 * Render only the fields currently earned by this account. Locked selections
 * remain in storage and can return later without one locked field suppressing
 * every other part of the identity.
 */
export function applyClubEntitlements(
  value: unknown,
  grants: Iterable<ClubEntitlementGrant>
): ClubIdentity {
  const identity = normalizeClubIdentity(value);
  const entitlements = resolveClubEntitlements(grants);
  const supporterActive = identity.editionId === "supporter" && entitlements.has("supporter_edition");
  return {
    clubName: entitlements.has("club_name_custom")
      ? identity.clubName
      : DEFAULT_CLUB_IDENTITY.clubName,
    paletteId: entitlements.has("kit_palette_basic") || supporterActive
      ? identity.paletteId
      : DEFAULT_CLUB_IDENTITY.paletteId,
    kitStyle: entitlements.has("kit_style_basic")
      ? identity.kitStyle
      : DEFAULT_CLUB_IDENTITY.kitStyle,
    badgeStyle: entitlements.has("badge_style_basic")
      ? identity.badgeStyle
      : DEFAULT_CLUB_IDENTITY.badgeStyle,
    editionId: supporterActive ? "supporter" : DEFAULT_CLUB_IDENTITY.editionId
  };
}

/** Merge edits to earned fields without deleting dormant locked selections. */
export function mergeEntitledClubIdentity(
  storedValue: unknown,
  editedValue: unknown,
  grants: Iterable<ClubEntitlementGrant>
): ClubIdentity {
  const stored = normalizeClubIdentity(storedValue);
  const edited = normalizeClubIdentity(editedValue);
  const entitlements = resolveClubEntitlements(grants);
  const supporterActive = edited.editionId === "supporter" && entitlements.has("supporter_edition");
  return {
    clubName: entitlements.has("club_name_custom") ? edited.clubName : stored.clubName,
    paletteId: entitlements.has("kit_palette_basic") || supporterActive ? edited.paletteId : stored.paletteId,
    kitStyle: entitlements.has("kit_style_basic") ? edited.kitStyle : stored.kitStyle,
    badgeStyle: entitlements.has("badge_style_basic") ? edited.badgeStyle : stored.badgeStyle,
    editionId: entitlements.has("supporter_edition") ? edited.editionId : stored.editionId
  };
}

/**
 * Validate untrusted persisted/form data and, optionally, enforce its unlocks.
 * Omitting grants validates shape only; passing grants makes the check suitable
 * for an API persistence boundary.
 */
export function validateClubIdentity(
  value: unknown,
  grants?: Iterable<ClubEntitlementGrant>
): ClubIdentityValidation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, errors: ["Club identity must be an object."], missingEntitlements: [] };
  }
  const candidate = value as Record<string, unknown>;
  const clubName = normalizeClubName(candidate.clubName);
  // v1 caches predate badge and edition fields; migrate those two fields only.
  const badgeStyle = candidate.badgeStyle === undefined
    ? DEFAULT_CLUB_IDENTITY.badgeStyle
    : candidate.badgeStyle;
  const editionId = candidate.editionId === undefined
    ? DEFAULT_CLUB_IDENTITY.editionId
    : candidate.editionId;
  const errors: string[] = [];
  const nameError = clubNameValidationMessage(clubName);
  if (nameError) errors.push(nameError);
  if (!isClubPaletteId(candidate.paletteId)) errors.push("Choose a valid club palette.");
  if (!isClubKitStyleId(candidate.kitStyle)) errors.push("Choose a valid kit style.");
  if (!isClubBadgeStyleId(badgeStyle)) errors.push("Choose a valid badge style.");
  if (!isClubEditionId(editionId)) errors.push("Choose a valid club edition.");
  if (
    errors.length > 0 ||
    !isClubPaletteId(candidate.paletteId) ||
    !isClubKitStyleId(candidate.kitStyle) ||
    !isClubBadgeStyleId(badgeStyle) ||
    !isClubEditionId(editionId)
  ) {
    return { valid: false, errors, missingEntitlements: [] };
  }

  const identity: ClubIdentity = {
    clubName,
    paletteId: candidate.paletteId,
    kitStyle: candidate.kitStyle,
    badgeStyle,
    editionId
  };
  const resolved = grants === undefined ? null : resolveClubEntitlements(grants);
  const missingEntitlements = resolved === null
    ? []
    : requiredClubEntitlements(identity).filter((entitlement) => !resolved.has(entitlement));
  return {
    valid: missingEntitlements.length === 0,
    value: identity,
    errors: missingEntitlements.length > 0 ? ["One or more club customizations are still locked."] : [],
    missingEntitlements
  };
}

/** Safely hydrate old or damaged caches without allowing uncontrolled IDs through. */
export function normalizeClubIdentity(value: unknown): ClubIdentity {
  const validation = validateClubIdentity(value);
  return validation.valid && validation.value
    ? validation.value
    : { ...DEFAULT_CLUB_IDENTITY };
}
