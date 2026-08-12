"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Link, NavGroup, useAuth } from "@payloadcms/ui";
import { getVisibleNavGroups, type NavItem } from "@/lib/admin-nav/nav-groups";

// Admin-rebrand Fase 1 (2026-08-12): vervangt BasisNavLinks.tsx +
// VariantenNavLinks.tsx (verwijderd) — zelfde afterNavLinks-mechanisme,
// zelfde Payload-CSS-klassen (nav__link, nav__link-indicator,
// nav__link-label) voor de actieve-link-opmaak, maar nu alle 24
// collecties/globals + 7 custom views in 4 taakgerichte hoofdgroepen
// (lib/admin-nav/nav-groups.ts is de bron van waarheid), i.p.v. een lange,
// ongegroepeerde Payload-standaardnav. Die standaardnav wordt via CSS
// verborgen (payload/components/admin-shell.css, op de stabiele
// nav-group-*/nav-*/nav-global-*-ids) — geen enkele collectie/global-config
// verandert hierdoor, dus geen risico op de eerder ontdekte
// admin.hidden-regressie (kapotte field-schema's/deep links).
//
// Permissiebewust (nieuw t.o.v. de oude twee bestanden, die dat niet waren
// — onschadelijk toen, want geen van hun doelen was adminOnly): leest
// useAuth().permissions, dezelfde, server-voorgevulde bron die Payload's
// eigen nav ook gebruikt om te bepalen wat een redacteur wel/niet mag zien
// — zonder dit zou een redacteur nu opeens adminOnly-onderdelen zoals
// Kennisbronnen/AI-evaluatie in de nav zien die voorheen (via Payload's
// eigen visibleEntities-filtering) verborgen bleven.
//
// NavGroup (@payloadcms/ui, dezelfde component als Payload's eigen
// DefaultNavClient gebruikt) geeft in-/uitklappen + de juiste pijl gratis.
// `label` moet een platte string blijven (NavGroup gebruikt 'm letterlijk
// in een template-string voor z'n eigen stabiele id/class — een
// icoon-node zou daar "[object Object]" van maken en drie groepen dezelfde
// id geven) — iconen staan daarom op de losse item-links, niet op de
// groepskop.
function NavLink({ item, pathname }: { item: NavItem; pathname: string }): ReactNode {
  const isActive = pathname.startsWith(item.href) && ["/", undefined].includes(pathname[item.href.length]);
  const Icon = item.icon;
  const content = (
    <>
      {isActive && <div className="nav__link-indicator" />}
      <Icon className="ml-nav-link__icon" size={16} aria-hidden="true" />
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
      <div className="ml-nav-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-kleur.svg" alt="MijnLeerlijn" className="ml-nav-brand__logo" />
        <span className="ml-nav-brand__subtitle">Helpdesk beheer</span>
      </div>

      {groups.map((group) =>
        group.placeholder ? (
          <div className="nav-group ml-nav-placeholder" key={group.id}>
            <div className="nav-group__label">
              {group.placeholder.label}
              <span className="ml-nav-placeholder__badge">{group.placeholder.badge}</span>
            </div>
          </div>
        ) : (
          <NavGroup key={group.id} label={group.label}>
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
            {group.mutedItems.length > 0 && (
              <>
                <div className="ml-nav-muted-label">Technisch</div>
                {group.mutedItems.map((item) => (
                  <div className="ml-nav-link--muted" key={item.href}>
                    <NavLink item={item} pathname={pathname} />
                  </div>
                ))}
              </>
            )}
          </NavGroup>
        )
      )}
    </>
  );
}
