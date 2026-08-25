import type { CSSProperties } from "react";
import type { Payload, SanitizedPermissions } from "payload";
import { Link } from "@payloadcms/ui";
import { getSelectedDashboardCards } from "@/lib/admin-nav/nav-groups";
import { getDashboardSelection } from "@/lib/admin-nav/dashboard-preferences";
import { NAV_COLOR_STYLES } from "@/lib/admin-nav/nav-colors";
import { SalesDashboardPaneel } from "./SalesDashboardPaneel";

// Fase 1B (2026-08-13), 65/35-indeling toegevoegd in Sales UX V2
// (2026-08-14): het dashboard toont voortaan twee kolommen — links "Mijn
// dag" (altijd-aanwezig, geen gebruikerskeuze) en rechts "Mijn favorieten"
// (ONGEWIJZIGD het bestaande, door de beheerder zelf gekozen mechanisme —
// zie getSelectedDashboardCards/dashboard-preferences.ts — nu alleen
// compacter gerenderd). De preference-opslag/-uitlezing zelf (Payload's
// payload-preferences, ml-dashboard-items) is hier NIET aangeraakt: dezelfde
// getDashboardSelection-aanroep, dezelfde BeheerTopBar.tsx-toggle blijft
// werken zoals vandaag.
//
// Sales UX-ronde 3 (2026-08-14) — "Mijn dag" is niet langer het vaste
// "Sales vandaag"-widget (SalesWidgetVandaag.tsx + lib/sales/
// widget-prioritering.ts, VERWIJDERD — nergens anders meer gebruikt) maar
// SalesDashboardPaneel.tsx: 3 tabs (Vandaag/To do/Vraag), client component
// omdat de Vraag-tab client-side interactiviteit nodig heeft die een server
// component niet kan bieden.
//
// `payload` zit al standaard in de serverProps die Payload's eigen
// DashboardView doorgeeft (node_modules/@payloadcms/next/dist/views/
// Dashboard/index.js) — geen extra doorgeefwerk nodig (SalesDashboardPaneel
// heeft 'm overigens niet nodig, die haalt zijn eigen data client-side op).
interface BeheerDashboardUser {
  id: number | string;
  collection: string;
  name?: string | null;
  // Admin gebruikersbeheer (2026-08-25) — zie payload/access/menu-permissions.ts.
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
      <p className="ml-dashboard__welcome-subtitle">Beheer de MijnLeerlijn Helpdesk, kennis en AI vanuit één plek.</p>

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
                    <h3 className="ml-dashboard__group-label">
                      <GroepIcon size={13} aria-hidden="true" />
                      {groep.label}
                    </h3>
                    <div className="ml-dashboard__compact-cards">
                      {groep.items.map((item) => {
                        const ItemIcon = item.icon;
                        const kleur = NAV_COLOR_STYLES[item.color];
                        const kleurVars = { "--item-fg": kleur.fg, "--item-bg": kleur.bg } as CSSProperties;
                        return (
                          <Link key={item.href} href={item.href} className="ml-dashboard__compact-card" prefetch={false}>
                            <span className="ml-dashboard__compact-card-icon" style={kleurVars}>
                              <ItemIcon size={14} aria-hidden="true" />
                            </span>
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
              <p className="ml-dashboard__empty-hint">
                Ga naar een beheerpagina en klik bovenaan op <strong>&ldquo;Toevoegen aan dashboard&rdquo;</strong> om die hier te laten verschijnen.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
