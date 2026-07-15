import type { HouseholdMemberRow, ProfileRow } from "./types";

// Curated palette (same spirit as TransactionList's CATEGORY_COLORS) so
// member colors stay visually consistent with the rest of the app instead
// of an open-ended <input type="color">.
export const MEMBER_COLOR_PALETTE = [
  "#059669", // emerald
  "#dc2626", // red
  "#2563eb", // blue
  "#d97706", // amber
  "#7c3aed", // violet
  "#0891b2", // cyan
  "#db2777", // pink
  "#65a30d", // lime
];

export function nextAvailableColor(usedColors: (string | null)[]): string {
  const used = new Set(usedColors.filter(Boolean));
  return MEMBER_COLOR_PALETTE.find((color) => !used.has(color)) ?? MEMBER_COLOR_PALETTE[0];
}

// Deterministic fallback so a member without an explicit color still gets a
// stable (not random-per-render) color derived from their user id.
export function resolveMemberColor(userId: string, explicitColor: string | null): string {
  if (explicitColor) return explicitColor;
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return MEMBER_COLOR_PALETTE[hash % MEMBER_COLOR_PALETTE.length];
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function resolveMemberName(
  member: HouseholdMemberRow | undefined,
  profile: ProfileRow | null | undefined,
  userId: string,
): string {
  return (
    member?.display_name ||
    profile?.display_name ||
    profile?.email ||
    `Membro ${userId.slice(0, 6)}`
  );
}
