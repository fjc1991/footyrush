import {
  CLUB_PALETTES,
  isClubPaletteId,
  type ClubPaletteId
} from "./club-identity";

/**
 * Supporter artwork is deliberately catalogued separately from standard club
 * kit and badge styles. Its fixed silhouette, sash and gold frame are the
 * visible proof of the account entitlement; only the club palette changes.
 */
export const SUPPORTER_DESIGNS = {
  founders_sash: {
    label: "Founders’ Rush Sash",
    shortLabel: "Founders’ Rush",
    description: "A fixed gold-trimmed shield and rush sash carrying the FootyRush mark.",
    version: 1
  }
} as const;

export type SupporterDesignId = keyof typeof SUPPORTER_DESIGNS;

export const DEFAULT_SUPPORTER_DESIGN_ID: SupporterDesignId = "founders_sash";

export const SUPPORTER_ARTWORK_COLORS = Object.freeze({
  navy: "#07162F",
  cyan: "#36CBE8",
  markFooty: "#FFFFFF",
  markRush: "#36CBE8",
  goldHighlight: "#FFE8A3",
  gold: "#D6A72A",
  goldShadow: "#7A4D08"
});

export type SupporterArtworkSize =
  | "micro"
  | "compact"
  | "standard"
  | "broadcast"
  | "preview";

export const SUPPORTER_BADGE_SIZES = Object.freeze({
  micro: { width: 28, height: 32 },
  compact: { width: 36, height: 40 },
  standard: { width: 52, height: 58 },
  broadcast: { width: 68, height: 76 },
  preview: { width: 112, height: 126 }
} satisfies Record<SupporterArtworkSize, { width: number; height: number }>);

export const SUPPORTER_KIT_SIZES = Object.freeze({
  micro: { width: 34, height: 36 },
  compact: { width: 48, height: 52 },
  standard: { width: 64, height: 70 },
  broadcast: { width: 88, height: 96 },
  preview: { width: 132, height: 145 }
} satisfies Record<SupporterArtworkSize, { width: number; height: number }>);

export interface SupporterPalette {
  id: ClubPaletteId;
  label: string;
  primary: string;
  secondary: string;
}

/** Resolve only allowlisted club palettes; raw user-supplied colours never reach SVG. */
export function resolveSupporterPalette(paletteId: unknown): SupporterPalette {
  const safePaletteId = isClubPaletteId(paletteId) ? paletteId : "footyrush";
  const palette = CLUB_PALETTES[safePaletteId];
  return {
    id: safePaletteId,
    label: palette.label,
    primary: palette.primary,
    secondary: palette.secondary
  };
}
