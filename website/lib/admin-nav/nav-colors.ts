import type { CategorieKleur } from "@/lib/data/categories";
import { CATEGORIE_KLEUREN } from "@/lib/data/categorie-kleuren";

// Fase 1B (2026-08-13): hergebruikt bewust het bestaande 9-kleurenpalet van
// categorie-tags (lib/data/categorie-kleuren.ts, o.a. de 5 merk-hexwaarden)
// als het "beperkte, consistente kleurenpalet" voor nav-/dashboard-iconen —
// geen tweede, los palet verzinnen. `bg` (zachte icoon-chip-achtergrond)
// wordt hieruit afgeleid, geen los ingevoerde tint per kleur.
export type NavColor = CategorieKleur;

export interface NavColorStyle {
  fg: string;
  bg: string;
}

function hexNaarRgba(hex: string, alpha: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const NAV_COLOR_STYLES: Record<NavColor, NavColorStyle> = Object.fromEntries(
  CATEGORIE_KLEUREN.map(({ value, hex }) => [value, { fg: hex, bg: hexNaarRgba(hex, 0.12) }])
) as Record<NavColor, NavColorStyle>;
