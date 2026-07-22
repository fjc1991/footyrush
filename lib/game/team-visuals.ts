export const TEAM_CODES = [
  "MUN",
  "CHE",
  "MCI",
  "ARS",
  "TOT",
  "LIV",
  "EVE",
  "STK",
  "SWA",
  "WHU",
  "SOU",
  "AVL",
  "QPR",
  "NEW",
  "HUL",
  "WBA",
  "LEI",
  "SUN",
  "CRY",
  "BUR",
  "BOU",
  "NOR",
  "WAT",
  "MID",
  "BHA",
  "HUD",
  "WOL",
  "FUL",
  "CAR",
  "SHU",
  "LEE",
  "BRE",
  "NFO",
  "LUT",
  "IPS",
  "BLB"
] as const;

export type KnownTeamCode = (typeof TEAM_CODES)[number];
export type TeamPattern = "solid" | "stripes" | "hoops" | "sash" | "halves" | "pinstripes" | "quarters";

export interface TeamVisual {
  primary: `#${string}`;
  secondary: `#${string}`;
  text: "#FFFFFF" | "#07162F";
  pattern: TeamPattern;
}

/**
 * A deliberately crest-free visual identity for every club in the game data.
 * Colours evoke each team while the geometric pattern keeps badges and kits
 * distinct without relying on licensed artwork.
 */
export const TEAM_VISUALS: Record<KnownTeamCode, TeamVisual> = {
  MUN: { primary: "#B51A28", secondary: "#F5C400", text: "#FFFFFF", pattern: "solid" },
  CHE: { primary: "#034694", secondary: "#F5F7FA", text: "#FFFFFF", pattern: "solid" },
  MCI: { primary: "#86C5E6", secondary: "#17345C", text: "#07162F", pattern: "solid" },
  ARS: { primary: "#C8102E", secondary: "#F5F7FA", text: "#FFFFFF", pattern: "halves" },
  TOT: { primary: "#F5F7FA", secondary: "#132257", text: "#07162F", pattern: "solid" },
  LIV: { primary: "#B71532", secondary: "#00A398", text: "#FFFFFF", pattern: "solid" },
  EVE: { primary: "#003399", secondary: "#F5F7FA", text: "#FFFFFF", pattern: "solid" },
  STK: { primary: "#C8102E", secondary: "#F5F7FA", text: "#FFFFFF", pattern: "stripes" },
  SWA: { primary: "#F5F7FA", secondary: "#111820", text: "#07162F", pattern: "solid" },
  WHU: { primary: "#6C1D45", secondary: "#79BDE8", text: "#FFFFFF", pattern: "halves" },
  SOU: { primary: "#C8102E", secondary: "#F5F7FA", text: "#FFFFFF", pattern: "stripes" },
  AVL: { primary: "#670E36", secondary: "#95BFE5", text: "#FFFFFF", pattern: "halves" },
  QPR: { primary: "#0054A6", secondary: "#F5F7FA", text: "#FFFFFF", pattern: "hoops" },
  NEW: { primary: "#111820", secondary: "#F5F7FA", text: "#FFFFFF", pattern: "stripes" },
  HUL: { primary: "#F5A300", secondary: "#111820", text: "#07162F", pattern: "stripes" },
  WBA: { primary: "#122F67", secondary: "#F5F7FA", text: "#FFFFFF", pattern: "stripes" },
  LEI: { primary: "#003090", secondary: "#F5C400", text: "#FFFFFF", pattern: "solid" },
  SUN: { primary: "#C8102E", secondary: "#F5F7FA", text: "#FFFFFF", pattern: "stripes" },
  CRY: { primary: "#1B458F", secondary: "#C4122E", text: "#FFFFFF", pattern: "halves" },
  BUR: { primary: "#6C1D45", secondary: "#79BDE8", text: "#FFFFFF", pattern: "solid" },
  BOU: { primary: "#B50E12", secondary: "#111820", text: "#FFFFFF", pattern: "stripes" },
  NOR: { primary: "#F4D600", secondary: "#08783D", text: "#07162F", pattern: "halves" },
  WAT: { primary: "#F4D600", secondary: "#B50E12", text: "#07162F", pattern: "stripes" },
  MID: { primary: "#C8102E", secondary: "#F5F7FA", text: "#FFFFFF", pattern: "solid" },
  BHA: { primary: "#0057B8", secondary: "#F5F7FA", text: "#FFFFFF", pattern: "stripes" },
  HUD: { primary: "#0072CE", secondary: "#F5F7FA", text: "#FFFFFF", pattern: "stripes" },
  WOL: { primary: "#FDB913", secondary: "#111820", text: "#07162F", pattern: "solid" },
  FUL: { primary: "#F5F7FA", secondary: "#111820", text: "#07162F", pattern: "pinstripes" },
  CAR: { primary: "#0054A6", secondary: "#C8102E", text: "#FFFFFF", pattern: "solid" },
  SHU: { primary: "#C8102E", secondary: "#F5F7FA", text: "#FFFFFF", pattern: "stripes" },
  LEE: { primary: "#F5F7FA", secondary: "#1D428A", text: "#07162F", pattern: "solid" },
  BRE: { primary: "#C8102E", secondary: "#F5F7FA", text: "#FFFFFF", pattern: "stripes" },
  NFO: { primary: "#C8102E", secondary: "#F5F7FA", text: "#FFFFFF", pattern: "solid" },
  LUT: { primary: "#E65A00", secondary: "#132257", text: "#07162F", pattern: "halves" },
  IPS: { primary: "#0044A7", secondary: "#F5F7FA", text: "#FFFFFF", pattern: "solid" },
  BLB: { primary: "#1675D1", secondary: "#F5F7FA", text: "#FFFFFF", pattern: "quarters" }
};

const fallbackPalettes: readonly TeamVisual[] = [
  { primary: "#17457A", secondary: "#69D2E7", text: "#FFFFFF", pattern: "sash" },
  { primary: "#5C255C", secondary: "#F2C14E", text: "#FFFFFF", pattern: "halves" },
  { primary: "#075D54", secondary: "#D8F3DC", text: "#FFFFFF", pattern: "hoops" },
  { primary: "#7A263A", secondary: "#9BD1E5", text: "#FFFFFF", pattern: "quarters" },
  { primary: "#243B6B", secondary: "#F27F0C", text: "#FFFFFF", pattern: "stripes" },
  { primary: "#3E5B2A", secondary: "#F4E285", text: "#FFFFFF", pattern: "pinstripes" }
];

function normalizeTeamCode(teamCode: string): string {
  return teamCode.trim().toUpperCase();
}

function hashTeamCode(teamCode: string): number {
  let hash = 2166136261;
  for (let index = 0; index < teamCode.length; index += 1) {
    hash ^= teamCode.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function isKnownTeamCode(teamCode: string): teamCode is KnownTeamCode {
  return Object.prototype.hasOwnProperty.call(TEAM_VISUALS, teamCode);
}

export function getTeamVisual(teamCode: string): TeamVisual {
  const normalized = normalizeTeamCode(teamCode);
  if (isKnownTeamCode(normalized)) {
    return TEAM_VISUALS[normalized];
  }
  return fallbackPalettes[hashTeamCode(normalized || "FOOTYRUSH") % fallbackPalettes.length];
}

export function getTeamMonogram(teamCode: string, teamName?: string): string {
  const normalized = normalizeTeamCode(teamCode).replace(/[^A-Z0-9]/g, "");
  if (normalized) return normalized.slice(0, 3);

  const words = teamName?.trim().split(/\s+/).filter(Boolean) ?? [];
  const initials = words.map((word) => word[0]?.toUpperCase()).join("");
  return initials.slice(0, 3) || "FR";
}

export function getTeamPatternBackground(visual: TeamVisual): string {
  const { primary, secondary, pattern } = visual;
  switch (pattern) {
    case "stripes":
      return `repeating-linear-gradient(90deg, ${primary} 0 24%, ${secondary} 24% 40%, ${primary} 40% 64%)`;
    case "hoops":
      return `repeating-linear-gradient(0deg, ${primary} 0 24%, ${secondary} 24% 40%, ${primary} 40% 64%)`;
    case "sash":
      return `linear-gradient(135deg, ${primary} 0 39%, ${secondary} 39% 57%, ${primary} 57% 100%)`;
    case "halves":
      return `linear-gradient(90deg, ${primary} 0 50%, ${secondary} 50% 100%)`;
    case "pinstripes":
      return `repeating-linear-gradient(90deg, ${primary} 0 15%, ${secondary} 15% 18%, ${primary} 18% 33%)`;
    case "quarters":
      return `conic-gradient(${primary} 0 25%, ${secondary} 25% 50%, ${primary} 50% 75%, ${secondary} 75% 100%)`;
    default:
      return primary;
  }
}

/** CSS custom properties consumed by `.team-badge` and `.team-kit`. */
export function getTeamVisualStyle(teamCode: string): Record<string, string> {
  const visual = getTeamVisual(teamCode);
  return {
    "--team-primary": visual.primary,
    "--team-secondary": visual.secondary,
    "--team-ink": visual.text,
    "--team-pattern": getTeamPatternBackground(visual)
  };
}
