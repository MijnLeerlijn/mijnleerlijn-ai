"use client";

import type { CSSProperties, ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BarChart3, Users } from "lucide-react";
import { Link, NavGroup, useAuth } from "@payloadcms/ui";
import { getVisibleNavGroups, type NavItem } from "@/lib/admin-nav/nav-groups";
import { NAV_COLOR_STYLES } from "@/lib/admin-nav/nav-colors";

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

const LESPLAN_ANALYTICS_ITEM: NavItem = {
  id: "lesplan-generator",
  label: "Lesplan Generator",
  href: "/admin/collections/lesplan-analytics",
  icon: BarChart3,
  color: "purple",
  description: "Bekijk welke leerdoelen, vakgebieden en groepen in de Lesplan Generator worden gevraagd.",
  permission: { type: "collection", slug: "lesplan-analytics" },
};

const GEBRUIKERS_ITEM: NavItem = {
  id: "gebruikers",
  permissionId: "algemeen.gebruikers",
  label: "Gebruikers & rechten",
  href: "/admin/collections/users",
  icon: Users,
  color: "green",
  description: "Beheer accounts en bepaal welke onderdelen iemand mag zien.",
  permission: { type: "collection", slug: "users" },
};

export function BeheerNavLinks() {
  const pathname = usePathname();
  const { permissions, user } = useAuth();
  const groups = getVisibleNavGroups(permissions, user);
  const beheerZichtbaar = groups.some((group) => group.id === "beheer");
  const isBeheerder = user?.role === "admin";

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
          {group.id === "content" && <NavLink item={LESPLAN_ANALYTICS_ITEM} pathname={pathname} />}
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

      {/* Lock-out bescherming: een beheerder moet altijd terug kunnen naar
          gebruikersbeheer, ook wanneer zijn/haar opgeslagen menu-permissies
          per ongeluk restricted zijn geraakt. Externe editors krijgen deze
          fallback nooit te zien. */}
      {isBeheerder && !beheerZichtbaar && (
        <NavGroup label="Beheer">
          <NavLink item={GEBRUIKERS_ITEM} pathname={pathname} />
        </NavGroup>
      )}
    </>
  );
}
