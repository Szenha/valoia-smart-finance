import type { CSSProperties } from "react";

type CalcumLogoProps = {
  className?: string;
  variant?: "full" | "icon";
  theme?: "light" | "dark";
  style?: CSSProperties;
};

export function CalcumLogo({
  className,
  variant = "full",
  theme = "light",
  style,
}: CalcumLogoProps) {
  const src =
    variant === "icon"
      ? "/assets/calcum-icon-official.png"
      : theme === "dark"
        ? "/assets/calcum-logo-official-on-light.png"
        : "/assets/calcum-logo-official-transparent.png";

  return (
    <img
      src={src}
      alt={variant === "full" ? "Calcum" : ""}
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
