"use client";

import type { CSSProperties, ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Link, NavGroup, useAuth } from "@payloadcms/ui";
import { getVisibleNavGroups, type NavItem } from "@/lib/admin-nav/nav-groups";
import { NAV_COLOR_STYLES } from "@/lib/admin-nav/nav-colors";

// Admin-rebrand Fase 1 (2026-08-12), uitgebreid in Fase 1B (2026-08-13):
// vervangt BasisNavLinks.tsx + VariantenNavLinks.tsx (verwijderd) — zelfde
// afterNavLinks-mechanisme, zelfde Payload-CSS-klassen (nav__link,
// nav__link-indicator, nav__link-label) voor de actieve-link-opmaak, maar nu
// alle 24 collecties/globals + 8 custom views in 4 taakgerichte hoofdgroepen
// (lib/admin-nav/nav-groups.ts is de bron van waarheid), i.p.v. een lange,
// ongegroepeerde Payload-standaardnav. Die standaardnav wordt via CSS
// verborgen (payload/components/admin-shell.css, op de stabiele
// nav-group-*/nav-*/nav-global-*-ids) — geen enkele collectie/global-config
// verandert hierdoor, dus geen risico op de eerder ontdekte
// admin.hidden-regressie (kapotte field-schema's/deep links).
//
// Permissiebewust: leest useAuth().permissions, dezelfde, server-voorgevulde
// bron die Payload's eigen nav ook gebruikt om te bepalen wat een redacteur
// wel/niet mag zien.
//
// NavGroup (@payloadcms/ui, dezelfde component als Payload's eigen
// DefaultNavClient gebruikt) geeft in-/uitklappen + de juiste pijl gratis.
// `label` moet een platte string blijven (NavGroup gebruikt 'm letterlijk
// in een template-string voor z'n eigen stabiele id/class) — iconen staan
// daarom op de losse item-links, niet op de groepskop.
//
// Fase 1B: elk item krijgt zijn eigen, vaste iconkleur (nav-colors.ts,
// hergebruikt het bestaande categorie-kleurenpalet) via een CSS custom
// property (--item-fg) — dezelfde kleur komt terug op de dashboardkaart van
// hetzelfde item (BeheerDashboard.tsx leest dezelfde nav-groups.ts-data).
// Gemute "Technisch"-items houden bewust hun bestaande neutrale grijs (de
// demping zou een felle kleur tegenwerken). De actieve-link-indicator kleurt
// zichzelf niet langer het icoon om (deed dat in Fase 1, toen alle iconen
// nog neutraal grijs waren) — dat zou nu de eigen identiteit van het item
// juist verstoren; "actief" blijft zichtbaar via de indicatorbalk + een
// zachte achtergrond (admin-shell.css).
function NavLink({ item, pathname, gekleurd = true }: { item: NavItem; pathname: string; gekleurd?: boolean }): ReactNode {
  const isActive = pathname.startsWith(item.href) && ["/", undefined].includes(pathname[item.href.length]);
  const Icon = item.icon;
  const kleurStyle = gekleurd ? ({ "--item-fg": NAV_COLOR_STYLES[item.color].fg } as CSSProperties) : undefined;
  const content = (
    <>
      {isActive && <div className="nav__link-indicator" />}
      <Icon className={`ml-nav-link__icon${gekleurd ? " ml-nav-link__icon--kleur" : ""}`} style={kleurStyle} size={16} aria-hidden="true" />
      <span className="nav__link-label">{item.label}</span>
    </>
  );
  if (pathname === item.href) {
    return <div className="nav__link ml-nav-link">{content}</div>;
  }
  return (
    <Link className="nav__link ml-nav-link" href={item.href} prefetch={false}>
      {content}
    </Link>
  );
}

export function BeheerNavLinks() {
  const pathname = usePathname();
  const { permissions } = useAuth();
  const groups = getVisibleNavGroups(permissions);

  return (
    <>
      <Link href="/admin" className="ml-nav-brand" prefetch={false}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-kleur.svg" alt="MijnLeerlijn" className="ml-nav-brand__logo" />
        <span className="ml-nav-brand__subtitle">Helpdesk beheer</span>
      </Link>

      {groups.map((group) => (
        <NavGroup key={group.id} label={group.label}>
          {group.items.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
          {group.mutedItems.length > 0 && (
            <>
              <div className="ml-nav-muted-label">Technisch</div>
              {group.mutedItems.map((item) => (
                <div className="ml-nav-link--muted" key={item.href}>
                  <NavLink item={item} pathname={pathname} gekleurd={false} />
                </div>
              ))}
            </>
          )}
        </NavGroup>
      ))}
    </>
  );
}
