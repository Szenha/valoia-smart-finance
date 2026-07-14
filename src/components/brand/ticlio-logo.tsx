import type { CSSProperties } from "react";

type TiclioLogoProps = {
  className?: string;
  variant?: "full" | "full-on-light" | "icon";
  style?: CSSProperties;
};

const SOURCES: Record<NonNullable<TiclioLogoProps["variant"]>, string> = {
  // Wordmark lockup with a solid white background baked in — gives
  // reliable contrast on dark surfaces (login, landing header/footer).
  full: "/assets/FundoBranco_Ticlio.png",
  // Same wordmark, transparent background, dark text, tightly cropped to
  // the actual glyphs (the source PNG has a lot of dead margin) — for
  // light surfaces (e.g. the expanded sidebar).
  "full-on-light": "/assets/SemFundo_Ticlio_tight.png",
  // Mark alone, tightly cropped so it fills a square frame edge-to-edge.
  icon: "/assets/Icone_Ticlio_tight.png",
};

export function TiclioLogo({ className, variant = "full", style }: TiclioLogoProps) {
  const src = SOURCES[variant];

  return (
    <img
      src={src}
      alt={variant === "icon" ? "" : "Ticlio"}
      aria-hidden={variant === "icon" ? true : undefined}
      className={className}
      draggable={false}
      style={{
        display: "block",
        height: "auto",
        maxWidth: "100%",
        objectFit: "contain",
        ...style,
      }}
    />
  );
}
