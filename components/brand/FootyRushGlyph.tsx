import type { SVGProps } from "react";

export const FOOTYRUSH_GLYPH_VIEW_BOX = "0 0 64 64";

export interface FootyRushGlyphProps extends Omit<SVGProps<SVGGElement>, "children"> {
  /** Fill used for the F when no surrounding brand treatment overrides it. */
  footyColor?: string;
  /** Fill used for the R when no surrounding brand treatment overrides it. */
  rushColor?: string;
  /** Optional hook for a wrapper that owns the F treatment. */
  footyClassName?: string;
  /** Optional hook for a wrapper that owns the R treatment. */
  rushClassName?: string;
}

/**
 * The code-native FR ligature without an owning `<svg>` element.
 *
 * Use it inside any SVG whose viewBox is `FOOTYRUSH_GLYPH_VIEW_BOX`. The
 * standalone defaults are the core white-and-cyan brand treatment; wrappers
 * can supply colours directly or override the retained path classes in CSS.
 */
export default function FootyRushGlyph({
  className = "",
  footyColor = "#FFFFFF",
  rushColor = "#36CBE8",
  footyClassName = "",
  rushClassName = "",
  ...groupProps
}: FootyRushGlyphProps) {
  return (
    <g
      {...groupProps}
      className={`footyrush-glyph${className ? ` ${className}` : ""}`}
    >
      <path
        className={`footyrush-glyph-footy${footyClassName ? ` ${footyClassName}` : ""}`}
        fill={footyColor}
        d="M4 10H28L24 20H16V27H25L21 37H16V54H4Z"
      />
      <path
        className={`footyrush-glyph-rush${rushClassName ? ` ${rushClassName}` : ""}`}
        fill={rushColor}
        fillRule="evenodd"
        clipRule="evenodd"
        d="M31 10H45C54 10 59 15 59 24C59 30.5 55.5 35 50.5 37L61 54H47L40 39V54H31V10ZM45 18.5a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11Z"
      />
    </g>
  );
}
