import type { SanitizedPermissions } from "payload";
import { Link } from "@payloadcms/ui";
import { getDashboardCards } from "@/lib/admin-nav/nav-groups";

// Admin-rebrand Fase 1 (2026-08-12): vervangt Payload's kale
// standaarddashboard. Geregistreerd als admin.components.views.dashboard.
// Anders dan de bestaande custom views (payload/components/AdminViewShell.tsx)
// heeft dit GEEN losse shell-wrapper nodig — de "dashboard"-viewKey valt
// samen met een ingebouwde Payload-route, dus DashboardView
// (@payloadcms/next) mount dit component altijd al binnen de standaard
// <DefaultTemplate>-chrome (zijbalk/header), vóórdat dit component zelf
// rendert. Bewust géén "use client": alleen leesbare, statische content —
// geen interactiviteit nodig.
//
// `user`/`permissions` komen hier niet uit AdminViewServerProps zelf, maar
// zijn extra velden die DashboardView (@payloadcms/next/dist/views/
// Dashboard/index.js) er handmatig aan toevoegt vóór het deze Component
// rendert — vandaar het losse, minimale proptype hieronder i.p.v. het
// standaard AdminViewServerProps-type te hergebruiken.
interface BeheerDashboardProps {
  permissions?: SanitizedPermissions;
  user?: { name?: string | null } | null;
}

export function BeheerDashboard({ permissions, user }: BeheerDashboardProps) {
  const groepen = getDashboardCards(permissions);
  const naam = user?.name?.trim();

  return (
    <div className="ml-dashboard">
      <h1 className="ml-dashboard__welcome-title">Welkom terug{naam ? `, ${naam}` : ""}</h1>
      <p className="ml-dashboard__welcome-subtitle">Beheer de MijnLeerlijn Helpdesk, kennis en AI vanuit één plek.</p>

      <div className="ml-dashboard__groups">
        {groepen.map((groep) => {
          const GroepIcon = groep.icon;
          return (
            <section key={groep.id}>
              <div className="ml-dashboard__group-label">
                <GroepIcon size={14} aria-hidden="true" />
                {groep.label}
              </div>
              <div className="ml-dashboard__cards">
                {groep.items.map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <Link className="ml-dashboard__card" href={item.href} key={item.href} prefetch={false}>
                      <span className="ml-dashboard__card-icon">
                        <ItemIcon size={18} aria-hidden="true" />
                      </span>
                      <span className="ml-dashboard__card-label">{item.label}</span>
                    </Link>
                  );
                })}
                {groep.placeholder && (
                  <div className="ml-dashboard__card ml-dashboard__card--placeholder">
                    <span className="ml-dashboard__card-icon">
                      <GroepIcon size={18} aria-hidden="true" />
                    </span>
                    <span className="ml-dashboard__card-label">{groep.placeholder.label}</span>
                    <span className="ml-dashboard__card-badge">{groep.placeholder.badge}</span>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
