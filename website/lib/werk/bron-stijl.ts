import type { NavColor } from "@/lib/admin-nav/nav-colors";

// Mijn Dag-productiecorrectie (2026-08-18, punt 4) — ÉÉN centrale
// bron-kleurmapping voor alle kaarttypen op het Mijn Dag-dashboard
// (SalesDashboardPaneel.tsx). Vervangt de losse, per-kaart hardgecodeerde
// NAV_COLOR_STYLES-verwijzingen (Gmail stond bv. per abuis op groen) —
// opdrachtseis: "Centraliseer deze styling/component-logica, zodat we niet
// op vier plekken afwijkende kaarten krijgen." Exacte kleurmapping, letterlijk
// uit de opdracht: Agenda=groen/turquoise, Gmail=paars, Monday/Sales=blauw,
// Eigen taak=oranje. "sales" dekt zowel een lokale Sales-actie als een
// Monday-planningkaart — die twee delen bewust dezelfde bronkleur (het zijn
// voor de gebruiker allebei "Sales").
export type KaartBron = "agenda" | "mail" | "sales" | "taak";

export const WERK_BRON_KLEUR: Record<KaartBron, NavColor> = {
  agenda: "green",
  mail: "purple",
  sales: "blue",
  taak: "orange",
};

export const WERK_BRON_LABEL: Record<KaartBron, string> = {
  agenda: "Agenda",
  mail: "Mail",
  sales: "Sales",
  taak: "Taak",
};

/**
 * CSS-modifierklasse voor de linkerrand-accent (zie
 * .ml-sales-widget__item--bron-* in admin-shell.css). Urgentie
 * (--achterstallig/--vandaag) staat later in het stylesheet en wint dus
 * altijd van de bronkleur wanneer beide op dezelfde kaart voorkomen — een
 * achterstallige actie moet rood/amber blijven, ongeacht bron.
 */
export function werkBronItemKlasse(bron: KaartBron): string {
  return `ml-sales-widget__item--bron-${bron}`;
}
