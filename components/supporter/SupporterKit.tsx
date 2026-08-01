"use client";

import { useId, type SVGProps } from "react";
import FootyRushGlyph from "@/components/brand/FootyRushGlyph";
import {
  DEFAULT_SUPPORTER_DESIGN_ID,
  SUPPORTER_ARTWORK_COLORS,
  SUPPORTER_DESIGNS,
  SUPPORTER_KIT_SIZES,
  resolveSupporterPalette,
  type SupporterArtworkSize,
  type SupporterDesignId
} from "@/lib/game/supporter-designs";
import type { ClubPaletteId } from "@/lib/game/club-identity";

const SHIRT_SHAPE = "M42 6L31 11L7 24L18 49L29 43V126H91V43L102 49L113 24L89 11L78 6C74 14 46 14 42 6Z";
const DISPLAY_SASH = "M84 -8L105 3L47 138L26 127Z";
const MICRO_SASH = "M82 -10L108 3L49 140L23 127Z";

type NativeSvgProps = Omit<
  SVGProps<SVGSVGElement>,
  "children" | "color" | "title"
>;

export interface SupporterKitProps extends NativeSvgProps {
  paletteId: ClubPaletteId;
  designId?: SupporterDesignId;
  size?: SupporterArtworkSize;
  playerNumber?: number | string;
  /** Omit only when decorative is true; otherwise a useful default is supplied. */
  title?: string;
  decorative?: boolean;
}

/** Flat Founders' Rush shirt, with a legible micro variant for pitch tokens. */
export default function SupporterKit({
  paletteId,
  designId = DEFAULT_SUPPORTER_DESIGN_ID,
  size = "standard",
  playerNumber,
  title,
  decorative = false,
  width,
  height,
  ...svgProps
}: SupporterKitProps) {
  const reactId = useId();
  const instanceId = reactId.replace(/[^a-zA-Z0-9_-]/g, "");
  const clipId = `supporter-kit-clip-${instanceId}`;
  const titleId = `supporter-kit-title-${instanceId}`;
  const palette = resolveSupporterPalette(paletteId);
  const dimensions = SUPPORTER_KIT_SIZES[size];
  const micro = size === "micro";
  const accessibleTitle = title ?? `${SUPPORTER_DESIGNS[designId].label} supporter kit`;
  const crestX = micro ? 81 : 82;
  const crestY = micro ? 35 : 40;
  const crestRadius = micro ? 14 : 12;
  const markSize = micro ? 20 : 17;
  const visibleNumber = playerNumber === undefined
    ? null
    : String(playerNumber).trim().slice(0, 2);

  return (
    <svg
      {...svgProps}
      viewBox="0 0 120 132"
      width={width ?? dimensions.width}
      height={height ?? dimensions.height}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? "true" : undefined}
      aria-labelledby={decorative ? undefined : titleId}
      focusable="false"
      data-supporter-artwork="kit"
      data-supporter-design={designId}
      data-supporter-palette={palette.id}
      data-supporter-size={size}
    >
      {!decorative && <title id={titleId}>{accessibleTitle}</title>}
      <defs>
        <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
          <path d={SHIRT_SHAPE} />
        </clipPath>
      </defs>

      <path
        d={SHIRT_SHAPE}
        fill={palette.primary}
        stroke={SUPPORTER_ARTWORK_COLORS.goldShadow}
        strokeWidth={micro ? 4 : 3}
        strokeLinejoin="round"
      />

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
        d="M9 37L19 43M111 37L101 43"
        fill="none"
        stroke={SUPPORTER_ARTWORK_COLORS.goldShadow}
        strokeWidth={micro ? 5 : 4}
        strokeLinecap="round"
      />
      <path
        d="M9 37L19 43M111 37L101 43"
        fill="none"
        stroke={SUPPORTER_ARTWORK_COLORS.gold}
        strokeWidth={micro ? 2.5 : 2}
        strokeLinecap="round"
      />

      <path
        d="M42 5Q60 23 78 5L72 2Q60 14 48 2Z"
        fill={SUPPORTER_ARTWORK_COLORS.gold}
        stroke={SUPPORTER_ARTWORK_COLORS.goldShadow}
        strokeWidth={micro ? 2.5 : 1.5}
        strokeLinejoin="round"
      />
      <path
        d="M48 4Q60 15 72 4Q69 14 60 16Q51 14 48 4Z"
        fill={SUPPORTER_ARTWORK_COLORS.navy}
      />

      <circle
        cx={crestX}
        cy={crestY}
        r={crestRadius + 1.5}
        fill={SUPPORTER_ARTWORK_COLORS.goldShadow}
      />
      <circle
        cx={crestX}
        cy={crestY}
        r={crestRadius}
        fill={SUPPORTER_ARTWORK_COLORS.gold}
      />
      <circle
        cx={crestX}
        cy={crestY}
        r={crestRadius - 2.5}
        fill={SUPPORTER_ARTWORK_COLORS.navy}
      />
      <svg
        x={crestX - markSize / 2}
        y={crestY - markSize / 2}
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

      {visibleNumber && (
        <g aria-hidden="true">
          <rect
            x={micro ? 43 : 46}
            y={micro ? 70 : 76}
            width={micro ? 34 : 28}
            height={micro ? 34 : 27}
            rx={micro ? 11 : 9}
            fill={SUPPORTER_ARTWORK_COLORS.navy}
            stroke={SUPPORTER_ARTWORK_COLORS.gold}
            strokeWidth={micro ? 3 : 2}
          />
          <text
            x="60"
            y={micro ? 94 : 96}
            fill="#FFFFFF"
            fontFamily="Arial, Helvetica, sans-serif"
            fontSize={micro ? 27 : 20}
            fontWeight="900"
            textAnchor="middle"
          >
            {visibleNumber}
          </text>
        </g>
      )}
    </svg>
  );
}
