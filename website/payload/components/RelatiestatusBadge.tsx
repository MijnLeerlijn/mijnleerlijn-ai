"use client";

import type { CSSProperties } from "react";
import { NAV_COLOR_STYLES } from "@/lib/admin-nav/nav-colors";
import { relatiestatusBadgeInfo } from "@/lib/sales/relatiestatus-badge";

// Sales UX V2 (2026-08-14) — enige plek die een relatiestatus-badge
// rendert. Gebruikt door de dashboardwidget, Vandaag, Scholenoverzicht,
// Schooldetail en Acties — geen losse per-pagina badge-CSS.
export function RelatiestatusBadge({ relatiestatus }: { relatiestatus?: string | null }) {
  const { label, kleur } = relatiestatusBadgeInfo(relatiestatus);
  const stijl = NAV_COLOR_STYLES[kleur];
  return (
    <span className="ml-sales__status-badge" style={{ "--item-fg": stijl.fg, "--item-bg": stijl.bg } as CSSProperties}>
      {label}
    </span>
  );
}
