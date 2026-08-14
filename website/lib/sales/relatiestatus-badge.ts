import type { NavColor } from "@/lib/admin-nav/nav-colors";

// Sales UX V2 (2026-08-14) — enige bron van waarheid voor relatiestatus-
// weergave: kleur EN label op één plek, gebruikt door de widget,
// Vandaag-werkkaarten, Scholenoverzicht-tabel, Schooldetail-kop en Acties.
// Kleuren zijn een expliciete keuze (bevestigd), geen aanname — hergebruikt
// het bestaande 9-kleurenpalet (lib/data/categorie-kleuren.ts via
// nav-colors.ts), geen nieuwe hexwaarden.
export const RELATIESTATUS_BADGE: Record<string, { label: string; kleur: NavColor }> = {
  Lead: { label: "Lead", kleur: "blue" },
  Prospect: { label: "Prospect", kleur: "purple" },
  "Wacht op handtekening": { label: "Wacht op handtekening", kleur: "orange" },
  Klant: { label: "Klant", kleur: "green" },
  Gestopt: { label: "Gestopt", kleur: "red" },
  Inactief: { label: "Inactief", kleur: "slate" },
};

const ONBEKEND = { label: "Onbekend", kleur: "slate" as NavColor };

export function relatiestatusBadgeInfo(relatiestatus: string | null | undefined): { label: string; kleur: NavColor } {
  if (!relatiestatus) return ONBEKEND;
  return RELATIESTATUS_BADGE[relatiestatus] ?? { label: relatiestatus, kleur: "slate" };
}
