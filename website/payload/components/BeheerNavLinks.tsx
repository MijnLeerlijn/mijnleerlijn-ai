"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BarChart3, Users } from "lucide-react";
import { Link, NavGroup, useAuth } from "@payloadcms/ui";
import { getVisibleNavGroups, type NavItem } from "@/lib/admin-nav/nav-groups";
import { NAV_COLOR_STYLES } from "@/lib/admin-nav/nav-colors";

function NavLink({ item, pathname, gekleurd = true }: { item: NavItem; pathname: string; gekleurd?: boolean }): ReactNode {
  const isActive = pathname.startsWith(item.href) && ["/", undefined].includes(pathname[item.href.length]);
  const Icon = item.icon;
  const kleurStyle = gekleurd ? ({ "--item-fg": NAV_COLOR_STYLES[item.color].fg } as CSSProperties) : undefined;
  const content = <>{isActive && <div className="nav__link-indicator" />}<Icon className={`ml-nav-link__icon${gekleurd ? " ml-nav-link__icon--kleur" : ""}`} style={kleurStyle} size={16} aria-hidden="true" /><span className="nav__link-label">{item.label}</span></>;
  if (pathname === item.href) return <div className="nav__link ml-nav-link">{content}</div>;
  return <Link className="nav__link ml-nav-link" href={item.href} prefetch={false}>{content}</Link>;
}

const LESPLAN_ANALYTICS_ITEM: NavItem = { id: "lesplan-generator", label: "Lesplan Generator", href: "/admin/collections/lesplan-analytics", icon: BarChart3, color: "purple", description: "Bekijk welke leerdoelen, vakgebieden en groepen in de Lesplan Generator worden gevraagd.", permission: { type: "collection", slug: "lesplan-analytics" } };
const GEBRUIKERS_ITEM: NavItem = { id: "gebruikers", permissionId: "algemeen.gebruikers", label: "Gebruikers & rechten", href: "/admin/collections/users", icon: Users, color: "green", description: "Beheer accounts en bepaal welke onderdelen iemand mag zien.", permission: { type: "collection", slug: "users" } };
type PayloadAccessResponse = { collections?: { users?: { create?: { permission?: boolean } } } };
type SessionProfile = { authenticated: boolean; restricted: boolean; firstHref: string | null };

export function BeheerNavLinks() {
  const pathname = usePathname();
  const { permissions, user } = useAuth();
  const groups = getVisibleNavGroups(permissions, user);
  const beheerZichtbaar = groups.some((group) => group.id === "beheer");
  const [magGebruikersAanmaken, setMagGebruikersAanmaken] = useState(false);
  const [profiel, setProfiel] = useState<SessionProfile | null>(null);

  useEffect(() => {
    let actief = true;
    void fetch("/api/admin/session-profile", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => response.ok ? (await response.json()) as SessionProfile : null)
      .then((data) => { if (actief) setProfiel(data); })
      .catch(() => { if (actief) setProfiel(null); });
    return () => { actief = false; };
  }, []);

  const restricted = profiel?.restricted === true;

  useEffect(() => {
    document.documentElement.classList.toggle("ml-admin-restricted", restricted);
    return () => document.documentElement.classList.remove("ml-admin-restricted");
  }, [restricted]);

  useEffect(() => {
    if (restricted) return;
    let actief = true;
    void fetch("/api/access", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return false;
        const data = (await response.json()) as PayloadAccessResponse;
        return data.collections?.users?.create?.permission === true;
      })
      .then((toegestaan) => { if (actief) setMagGebruikersAanmaken(toegestaan); })
      .catch(() => { if (actief) setMagGebruikersAanmaken(false); });
    return () => { actief = false; };
  }, [restricted]);

  const eersteHref = profiel?.firstHref ?? groups.flatMap((group) => group.items).at(0)?.href ?? "/admin";

  return (
    <>
      <Link href={restricted ? eersteHref : "/admin"} className={`ml-nav-brand${restricted ? " ml-nav-brand--restricted" : ""}`} prefetch={false}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-kleur.svg" alt="MijnLeerlijn" className="ml-nav-brand__logo" />
        {!restricted && <span className="ml-nav-brand__subtitle">Helpdesk beheer</span>}
      </Link>

      {groups.map((group) => (
        <NavGroup key={group.id} label={group.label}>
          {group.items.map((item) => <NavLink key={item.href} item={item} pathname={pathname} />)}
          {!restricted && group.id === "content" && <NavLink item={LESPLAN_ANALYTICS_ITEM} pathname={pathname} />}
          {!restricted && group.mutedItems.length > 0 && <><div className="ml-nav-muted-label">Technisch</div>{group.mutedItems.map((item) => <div className="ml-nav-link--muted" key={item.href}><NavLink item={item} pathname={pathname} gekleurd={false} /></div>)}</>}
        </NavGroup>
      ))}

      {!restricted && magGebruikersAanmaken && !beheerZichtbaar && <NavGroup label="Beheer"><NavLink item={GEBRUIKERS_ITEM} pathname={pathname} /></NavGroup>}
    </>
  );
}