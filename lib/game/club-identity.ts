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

export type ClubPaletteId = keyof typeof CLUB_PALETTES;
export type ClubKitStyleId = keyof typeof CLUB_KIT_STYLES;

export interface ClubIdentity {
  clubName: string;
  paletteId: ClubPaletteId;
  kitStyle: ClubKitStyleId;
}

export const DEFAULT_CLUB_IDENTITY: Readonly<ClubIdentity> = Object.freeze({
  clubName: "FootyRush FC",
  paletteId: "footyrush",
  kitStyle: "solid"
});

export type ClubEntitlement =
  | "club_name_custom"
  | "kit_palette_basic"
  | "kit_style_basic";

/**
 * One independently revocable reason that an account may use a customization.
 * Achievement, purchase and administrator grants can therefore coexist without
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

/**
 * Merge all active grant sources. Callers may append future purchase or admin
 * grants to the achievement grants without changing the unlock checks.
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
  if (normalizeClubName(identity.clubName) !== DEFAULT_CLUB_IDENTITY.clubName) {
    required.push("club_name_custom");
  }
  if (identity.paletteId !== DEFAULT_CLUB_IDENTITY.paletteId) {
    required.push("kit_palette_basic");
  }
  if (identity.kitStyle !== DEFAULT_CLUB_IDENTITY.kitStyle) {
    required.push("kit_style_basic");
  }
  return required;
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
  const errors: string[] = [];
  const nameError = clubNameValidationMessage(clubName);
  if (nameError) errors.push(nameError);
  if (!isClubPaletteId(candidate.paletteId)) errors.push("Choose a valid club palette.");
  if (!isClubKitStyleId(candidate.kitStyle)) errors.push("Choose a valid kit style.");
  if (errors.length > 0 || !isClubPaletteId(candidate.paletteId) || !isClubKitStyleId(candidate.kitStyle)) {
    return { valid: false, errors, missingEntitlements: [] };
  }

  const identity: ClubIdentity = {
    clubName,
    paletteId: candidate.paletteId,
    kitStyle: candidate.kitStyle
  };
  const missingEntitlements = grants === undefined
    ? []
    : requiredClubEntitlements(identity).filter((entitlement) => !hasClubEntitlement(grants, entitlement));
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
