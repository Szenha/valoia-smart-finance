import type { CSSProperties } from "react";

type ValoiaLogoProps = {
  className?: string;
  variant?: "full" | "full-on-light" | "icon";
  style?: CSSProperties;
};

const SOURCES: Record<NonNullable<ValoiaLogoProps["variant"]>, string> = {
  // Wordmark lockup with a solid dark-navy background baked into the
  // asset — pair it with a dark surface (login, landing header/footer).
  full: "/assets/Logo1.png",
  // Same wordmark, transparent background, dark text — for light surfaces
  // (e.g. the expanded sidebar).
  "full-on-light": "/assets/Logo 4 sem fundo.png",
  // Mark alone on a near-white background.
  icon: "/assets/Logo2.png",
};

export function ValoiaLogo({ className, variant = "full", style }: ValoiaLogoProps) {
  const src = SOURCES[variant];

  return (
    <img
      src={src}
      alt={variant === "icon" ? "" : "Valoia"}
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
