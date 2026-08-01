import FootyRushGlyph, {
  FOOTYRUSH_GLYPH_VIEW_BOX
} from "@/components/brand/FootyRushGlyph";

interface FootyRushMarkProps {
  className?: string;
  title?: string;
  tone?: "brand" | "gold" | "light";
}

/** A compact FR rush ligature that stays legible from kit-chest to app-icon size. */
export default function FootyRushMark({
  className = "",
  title,
  tone = "brand"
}: FootyRushMarkProps) {
  const labelled = Boolean(title);
  return (
    <svg
      viewBox={FOOTYRUSH_GLYPH_VIEW_BOX}
      className={`footyrush-mark footyrush-mark--${tone}${className ? ` ${className}` : ""}`}
      role={labelled ? "img" : undefined}
      aria-hidden={labelled ? undefined : "true"}
      aria-label={labelled ? title : undefined}
      focusable="false"
    >
      <FootyRushGlyph
        footyClassName="footyrush-mark-footy"
        rushClassName="footyrush-mark-rush"
      />
    </svg>
  );
}
