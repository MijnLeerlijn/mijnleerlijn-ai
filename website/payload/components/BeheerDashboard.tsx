import type { CSSProperties } from "react";
import type { Payload, SanitizedPermissions } from "payload";
import { Link } from "@payloadcms/ui";
import { getSelectedDashboardCards } from "@/lib/admin-nav/nav-groups";
import { getDashboardSelection } from "@/lib/admin-nav/dashboard-preferences";
import { NAV_COLOR_STYLES } from "@/lib/admin-nav/nav-colors";
import { SalesDashboardPaneel } from "./SalesDashboardPaneel";
import { LesplanAnalyticsDashboard } from "./LesplanAnalyticsDashboard";

interface BeheerDashboardUser {
  id: number | string;
  collection: string;
  name?: string | null;
  permissionMode?: "full" | "restricted" | null;
  permissions?: unknown;
}

interface BeheerDashboardProps {
  permissions?: SanitizedPermissions;
  user?: BeheerDashboardUser | null;
  payload: Payload;
}

export async function BeheerDashboard({ permissions, user, payload }: BeheerDashboardProps) {
  const naam = user?.name?.trim();
  const geselecteerdeHrefs = await getDashboardSelection(payload, user ?? null);
  const groepen = getSelectedDashboardCards(permissions, user ?? null, geselecteerdeHrefs);
  const heeftKeuze = groepen.length > 0;

  return (
    <div className="ml-dashboard">
      <h1 className="ml-dashboard__welcome-title">Welkom terug{naam ? `, ${naam}` : ""}</h1>
      <p className="ml-dashboard__welcome-subtitle">Beheer MijnLeerlijn vanuit één plek.</p>

      <div className="ml-dashboard__layout">
        <div className="ml-dashboard__mijn-dag">
          <h2 className="ml-dashboard__kolom-titel">Mijn dag</h2>
          <SalesDashboardPaneel />
        </div>

        <div className="ml-dashboard__favorieten">
          <h2 className="ml-dashboard__kolom-titel">Mijn favorieten</h2>
          {heeftKeuze ? (
            <div className="ml-dashboard__groups-compact">
              {groepen.map((groep) => {
                const GroepIcon = groep.icon;
                return (
                  <section key={groep.id}>
                    <h3 className="ml-dashboard__group-label"><GroepIcon size={13} aria-hidden="true" />{groep.label}</h3>
                    <div className="ml-dashboard__compact-cards">
                      {groep.items.map((item) => {
                        const ItemIcon = item.icon;
                        const kleur = NAV_COLOR_STYLES[item.color];
                        const kleurVars = { "--item-fg": kleur.fg, "--item-bg": kleur.bg } as CSSProperties;
                        return (
                          <Link key={item.href} href={item.href} className="ml-dashboard__compact-card" prefetch={false}>
                            <span className="ml-dashboard__compact-card-icon" style={kleurVars}><ItemIcon size={14} aria-hidden="true" /></span>
                            <span className="ml-dashboard__compact-card-label">{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="ml-dashboard__empty">
              <p className="ml-dashboard__empty-text">Voeg de onderdelen toe die je hier snel wilt kunnen openen.</p>
              <p className="ml-dashboard__empty-hint">Ga naar een beheerpagina en klik bovenaan op <strong>&ldquo;Toevoegen aan dashboard&rdquo;</strong>.</p>
            </div>
          )}
        </div>
      </div>

      <LesplanAnalyticsDashboard payload={payload} />
    </div>
  );
}
