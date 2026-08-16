"use client";

import type { CSSProperties } from "react";
import { NAV_COLOR_STYLES, type NavColor } from "@/lib/admin-nav/nav-colors";
import { formatKorteDatum } from "@/lib/sales/format-datum";
import type { PlanningStatus } from "@/lib/sales/planning-status";

// Sales-logica productiecorrectie 2026-08-16 (punt 6) — ÉÉN centrale badge
// voor het resultaat van bepaalPlanningStatus() (lib/sales/planning-status.ts),
// gebruikt op Dashboard (Vandaag + To-do), Sales Overzicht, Scholenoverzicht
// en Schooldetail, zodat dezelfde vraag ("is er al iets gepland, of moet ik
// nog iets beslissen?") overal identiek beantwoord wordt. Zelfde
// "gedeelde badge, geen losse per-pagina implementatie"-patroon als
// RelatiestatusBadge.tsx, hergebruikt dezelfde NAV_COLOR_STYLES-tokens en
// .ml-sales__status-badge-stijl (opdrachtseis: bestaande design tokens).
const INFO_PER_STATUS: Record<PlanningStatus, { label: string; kleur: NavColor }> = {
  gepland: { label: "Gepland", kleur: "green" },
  vandaag: { label: "Vandaag", kleur: "blue" },
  achterstallig: { label: "Achterstallig", kleur: "red" },
  actie_nodig: { label: "Beslissing nodig", kleur: "orange" },
  voorstel_te_beoordelen: { label: "AI-voorstel", kleur: "purple" },
};

export interface PlanningStatusBadgeProps {
  status: PlanningStatus | null;
  /** Alleen gebruikt bij status "gepland" — "Gepland · 24 aug" i.p.v. kaal "Gepland". */
  datum?: string | null;
}

/** Inactief/Gestopt/van-board-gehaald (status null) renderen bewust niets — geen badge waar geen planningsysteem op van toepassing is. */
export function PlanningStatusBadge({ status, datum }: PlanningStatusBadgeProps) {
  if (!status) return null;
  const info = INFO_PER_STATUS[status];
  const stijl = NAV_COLOR_STYLES[info.kleur];
  const tekst = status === "gepland" && datum ? `${info.label} · ${formatKorteDatum(datum)}` : info.label;
  return (
    <span className="ml-sales__status-badge" style={{ "--item-fg": stijl.fg, "--item-bg": stijl.bg } as CSSProperties}>
      {tekst}
    </span>
  );
}
