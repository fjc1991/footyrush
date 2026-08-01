"use client";

import { useId, type SVGProps } from "react";
import FootyRushGlyph from "@/components/brand/FootyRushGlyph";
import {
  DEFAULT_SUPPORTER_DESIGN_ID,
  SUPPORTER_ARTWORK_COLORS,
  SUPPORTER_BADGE_SIZES,
  SUPPORTER_DESIGNS,
  resolveSupporterPalette,
  type SupporterArtworkSize,
  type SupporterDesignId
} from "@/lib/game/supporter-designs";
import type { ClubPaletteId } from "@/lib/game/club-identity";

const OUTER_SHIELD = "M9 4H87L94 16V64C94 84 77 99 48 106C19 99 2 84 2 64V16L9 4Z";
const INNER_SHIELD = "M12 10H84L88 19V63C88 79 74 91 48 98C22 91 8 79 8 63V19L12 10Z";
const DISPLAY_SASH = "M75 -8L94 3L25 111L6 100Z";
const MICRO_SASH = "M73 -10L97 4L27 114L3 100Z";

type NativeSvgProps = Omit<
  SVGProps<SVGSVGElement>,
  "children" | "color" | "title"
>;

export interface SupporterBadgeProps extends NativeSvgProps {
  paletteId: ClubPaletteId;
  designId?: SupporterDesignId;
  size?: SupporterArtworkSize;
  /** Omit only when decorative is true; otherwise a useful default is supplied. */
  title?: string;
  decorative?: boolean;
}

/** Flat, resolution-independent Founders' Rush supporter crest. */
export default function SupporterBadge({
  paletteId,
  designId = DEFAULT_SUPPORTER_DESIGN_ID,
  size = "standard",
  title,
  decorative = false,
  width,
  height,
  ...svgProps
}: SupporterBadgeProps) {
  const reactId = useId();
  const instanceId = reactId.replace(/[^a-zA-Z0-9_-]/g, "");
  const clipId = `supporter-badge-clip-${instanceId}`;
  const titleId = `supporter-badge-title-${instanceId}`;
  const palette = resolveSupporterPalette(paletteId);
  const dimensions = SUPPORTER_BADGE_SIZES[size];
  const micro = size === "micro";
  const accessibleTitle = title ?? `${SUPPORTER_DESIGNS[designId].label} supporter badge`;
  const roundelRadius = micro ? 25 : 23;
  const markSize = micro ? 38 : 34;

  return (
    <svg
      {...svgProps}
      viewBox="0 0 96 108"
      width={width ?? dimensions.width}
      height={height ?? dimensions.height}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? "true" : undefined}
      aria-labelledby={decorative ? undefined : titleId}
      focusable="false"
      data-supporter-artwork="badge"
      data-supporter-design={designId}
      data-supporter-palette={palette.id}
      data-supporter-size={size}
    >
      {!decorative && <title id={titleId}>{accessibleTitle}</title>}
      <defs>
        <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
          <path d={INNER_SHIELD} />
        </clipPath>
      </defs>

      <path
        d={OUTER_SHIELD}
        fill={SUPPORTER_ARTWORK_COLORS.gold}
        stroke={SUPPORTER_ARTWORK_COLORS.goldShadow}
        strokeWidth={micro ? 4 : 3}
        strokeLinejoin="round"
      />
      <path d={INNER_SHIELD} fill={palette.primary} />

      <g clipPath={`url(#${clipId})`}>
        <path
          d={micro ? MICRO_SASH : DISPLAY_SASH}
          fill={palette.secondary}
          stroke={SUPPORTER_ARTWORK_COLORS.goldShadow}
          strokeWidth={micro ? 7 : 6}
          strokeLinejoin="round"
        />
        <path
          d={micro ? MICRO_SASH : DISPLAY_SASH}
          fill={palette.secondary}
          stroke={SUPPORTER_ARTWORK_COLORS.gold}
          strokeWidth={micro ? 3 : 2.5}
          strokeLinejoin="round"
        />
      </g>

      <path
        d={INNER_SHIELD}
        fill="none"
        stroke={micro ? SUPPORTER_ARTWORK_COLORS.gold : SUPPORTER_ARTWORK_COLORS.goldHighlight}
        strokeWidth={micro ? 2.5 : 1.5}
        strokeLinejoin="round"
      />

      <circle
        cx="48"
        cy="54"
        r={roundelRadius + 2}
        fill={SUPPORTER_ARTWORK_COLORS.goldShadow}
      />
      <circle
        cx="48"
        cy="54"
        r={roundelRadius}
        fill={SUPPORTER_ARTWORK_COLORS.gold}
      />
      <circle
        cx="48"
        cy="54"
        r={roundelRadius - 3}
        fill={SUPPORTER_ARTWORK_COLORS.navy}
      />
      <svg
        x={48 - markSize / 2}
        y={54 - markSize / 2}
        width={markSize}
        height={markSize}
        viewBox="0 0 64 64"
        aria-hidden="true"
      >
        <FootyRushGlyph
          footyColor={SUPPORTER_ARTWORK_COLORS.markFooty}
          rushColor={SUPPORTER_ARTWORK_COLORS.markRush}
        />
      </svg>
    </svg>
  );
}
