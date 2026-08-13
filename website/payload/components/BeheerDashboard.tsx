import type { CSSProperties } from "react";
import type { Payload, SanitizedPermissions } from "payload";
import { Link } from "@payloadcms/ui";
import { getSelectedDashboardCards } from "@/lib/admin-nav/nav-groups";
import { getDashboardSelection } from "@/lib/admin-nav/dashboard-preferences";
import { NAV_COLOR_STYLES } from "@/lib/admin-nav/nav-colors";

// Fase 1B (2026-08-13): het dashboard toont voortaan uitsluitend wat de
// ingelogde beheerder zelf gekozen heeft (BeheerTopBar.tsx se "toevoegen/
// verwijderen van dashboard"), niet meer automatisch elke collectie met
// dashboardCard: true — zie getSelectedDashboardCards in
// lib/admin-nav/nav-groups.ts. Leest de keuze hier, server-side, via
// Payload's Local API (dashboard-preferences.ts) i.p.v. client-side
// usePreferences() — voorkomt een laadflits bij het eerste renderen.
//
// `payload` zit al standaard in de serverProps die Payload's eigen
// DashboardView doorgeeft (node_modules/@payloadcms/next/dist/views/
// Dashboard/index.js) — geen extra doorgeefwerk nodig.
interface BeheerDashboardUser {
  id: number | string;
  collection: string;
  name?: string | null;
}

interface BeheerDashboardProps {
  permissions?: SanitizedPermissions;
  user?: BeheerDashboardUser | null;
  payload: Payload;
}

export async function BeheerDashboard({ permissions, user, payload }: BeheerDashboardProps) {
  const naam = user?.name?.trim();
  const geselecteerdeHrefs = await getDashboardSelection(payload, user ?? null);
  const groepen = getSelectedDashboardCards(permissions, geselecteerdeHrefs);
  const heeftKeuze = groepen.length > 0;

  return (
    <div className="ml-dashboard">
      <h1 className="ml-dashboard__welcome-title">Welkom terug{naam ? `, ${naam}` : ""}</h1>
      <p className="ml-dashboard__welcome-subtitle">Beheer de MijnLeerlijn Helpdesk, kennis en AI vanuit één plek.</p>

      {heeftKeuze ? (
        <div className="ml-dashboard__groups">
          {groepen.map((groep) => {
            const GroepIcon = groep.icon;
            return (
              <section key={groep.id}>
                <h2 className="ml-dashboard__group-label">
                  <GroepIcon size={15} aria-hidden="true" />
                  {groep.label}
                </h2>
                <div className="ml-dashboard__cards">
                  {groep.items.map((item) => {
                    const ItemIcon = item.icon;
                    const kleur = NAV_COLOR_STYLES[item.color];
                    const kleurVars = { "--item-fg": kleur.fg, "--item-bg": kleur.bg } as CSSProperties;
                    return (
                      <Link key={item.href} href={item.href} className="ml-dashboard__card" prefetch={false}>
                        <span className="ml-dashboard__card-icon" style={kleurVars}>
                          <ItemIcon size={18} aria-hidden="true" />
                        </span>
                        <span className="ml-dashboard__card-text">
                          <span className="ml-dashboard__card-label">{item.label}</span>
                          <span className="ml-dashboard__card-description">{item.description}</span>
                        </span>
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
          <h2 className="ml-dashboard__empty-title">Mijn dashboard</h2>
          <p className="ml-dashboard__empty-text">Voeg de onderdelen toe die je hier snel wilt kunnen openen.</p>
          <p className="ml-dashboard__empty-hint">
            Ga naar een beheerpagina en klik bovenaan op <strong>&ldquo;Toevoegen aan dashboard&rdquo;</strong> om die hier te laten verschijnen.
          </p>
        </div>
      )}
    </div>
  );
}
