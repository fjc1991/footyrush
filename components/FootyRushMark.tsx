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
      viewBox="0 0 64 64"
      className={`footyrush-mark footyrush-mark--${tone}${className ? ` ${className}` : ""}`}
      role={labelled ? "img" : undefined}
      aria-hidden={labelled ? undefined : "true"}
      aria-label={labelled ? title : undefined}
      focusable="false"
    >
      <path
        className="footyrush-mark-footy"
        d="M4 10H28L24 20H16V27H25L21 37H16V54H4Z"
      />
      <path
        className="footyrush-mark-rush"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M31 10H45C54 10 59 15 59 24C59 30.5 55.5 35 50.5 37L61 54H47L40 39V54H31V10ZM45 18.5a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11Z"
      />
    </svg>
  );
}
