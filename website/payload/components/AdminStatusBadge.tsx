"use client";

import type { CSSProperties } from "react";
import { NAV_COLOR_STYLES, type NavColor } from "@/lib/admin-nav/nav-colors";

// Visuele polishronde (2026-08-24) — generieke statusbadge voor het Admin
// Trainerdashboard, zelfde .ml-sales__status-badge/--item-fg/--item-bg-
// mechanisme als RelatiestatusBadge.tsx/MailStatusBadge.tsx/
// PlanningStatusBadge.tsx (Sales). Daar is de kleur per badge-type
// hardcoded in een eigen component; hier zijn het vijf verschillende
// statusdomeinen (verslag/telefonie/writeback/weergave/aandacht) binnen
// dezelfde feature, dus één generieke component die kleur+label al
// bepaald aangeleverd krijgt (lib/admin/trainers/status-kleuren.ts) i.p.v.
// vijf bijna-identieke bestanden.
export function AdminStatusBadge({ label, kleur }: { label: string; kleur: NavColor }) {
  const stijl = NAV_COLOR_STYLES[kleur];
  return (
    <span className="ml-sales__status-badge" style={{ "--item-fg": stijl.fg, "--item-bg": stijl.bg } as CSSProperties}>
      {label}
    </span>
  );
}
