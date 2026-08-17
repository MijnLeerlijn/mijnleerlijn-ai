"use client";

import type { CSSProperties } from "react";
import { NAV_COLOR_STYLES } from "@/lib/admin-nav/nav-colors";
import type { MailCategorie } from "@/lib/werk/mail-classificatie";

// Mijn Dag-productiecorrectie (2026-08-18, punt 3) — statusbadge op de
// mailkaart, exacte labels uit de opdracht. Zelfde "gedeelde badge, geen
// losse per-plek implementatie"-patroon als PlanningStatusBadge.tsx,
// hergebruikt dezelfde .ml-sales__status-badge-stijl.
const INFO_PER_CATEGORIE: Record<MailCategorie, { label: string; kleur: "orange" | "green" | "purple" | "blue" }> = {
  antwoord_nodig: { label: "Antwoord nodig", kleur: "orange" },
  afspraak: { label: "Afspraak", kleur: "green" },
  toezegging: { label: "Toezegging", kleur: "purple" },
  ter_beoordeling: { label: "Ter beoordeling", kleur: "blue" },
};

export function MailStatusBadge({ categorie }: { categorie: MailCategorie }) {
  const info = INFO_PER_CATEGORIE[categorie];
  const stijl = NAV_COLOR_STYLES[info.kleur];
  return (
    <span className="ml-sales__status-badge" style={{ "--item-fg": stijl.fg, "--item-bg": stijl.bg } as CSSProperties}>
      {info.label}
    </span>
  );
}
