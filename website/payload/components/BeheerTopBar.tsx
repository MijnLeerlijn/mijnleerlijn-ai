"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Button, Link, usePreferences } from "@payloadcms/ui";
import { Home } from "lucide-react";
import { findNavItemByPath } from "@/lib/admin-nav/nav-groups";
import { DASHBOARD_PREFERENCE_KEY } from "@/lib/admin-nav/dashboard-preferences";

// Fase 1B (2026-08-13): geregistreerd als admin.components.header — één
// registratie, verschijnt daardoor automatisch boven ELKE pagina die
// DefaultTemplate gebruikt (dashboard, alle native collectie-/global-
// views, én — via het bestaande AdminViewShell.tsx-patroon — alle 7 custom
// views), zonder dat een enkele pagina zelf aangepast hoeft te worden. De
// inlogpagina gebruikt MinimalTemplate, die admin.components.header niet
// leest — verschijnt daar dus vanzelf niet (node_modules/@payloadcms/next/
// dist/templates/{Default,Minimal}/index.js, rechtstreeks nagelezen).
//
// Combineert twee dingen uit hetzelfde route-opzoekwerk (findNavItemByPath,
// lib/admin-nav/nav-groups.ts — dezelfde bron als de nav/het dashboard):
// de klikbare "Dashboard"-breadcrumb (opdracht: altijd bovenaan, overal
// bereikbaar) en de "toevoegen/verwijderen van dashboard"-schakelaar
// (opdracht: het menu-item zelf, niet een los record — daarom alleen
// zichtbaar bij exact === true, dus op de menupagina zelf, niet op bv. de
// bewerkpagina van één artikel).
export function BeheerTopBar() {
  const pathname = usePathname();
  const { getPreference, setPreference } = usePreferences();
  const match = findNavItemByPath(pathname ?? "");
  const [selectie, setSelectie] = useState<string[] | null>(null);

  useEffect(() => {
    let actief = true;
    void (async () => {
      const waarde = await getPreference<string[]>(DASHBOARD_PREFERENCE_KEY);
      if (actief) setSelectie(Array.isArray(waarde) ? waarde : []);
    })();
    return () => {
      actief = false;
    };
  }, [getPreference]);

  const item = match?.item;
  const isGekozen = item ? (selectie ?? []).includes(item.href) : false;

  async function toggleDashboard() {
    if (!item) return;
    const huidige = selectie ?? [];
    const nieuw = isGekozen ? huidige.filter((href) => href !== item.href) : [...huidige, item.href];
    setSelectie(nieuw);
    await setPreference(DASHBOARD_PREFERENCE_KEY, nieuw);
  }

  return (
    <div className="ml-topbar">
      <div className="ml-topbar__breadcrumb">
        <Link href="/admin" className="ml-topbar__crumb ml-topbar__crumb--home" prefetch={false}>
          <Home size={15} aria-hidden="true" />
          Dashboard
        </Link>
        {match && (
          <>
            <span className="ml-topbar__sep" aria-hidden="true">
              /
            </span>
            <span className="ml-topbar__crumb">{match.group.label}</span>
            <span className="ml-topbar__sep" aria-hidden="true">
              /
            </span>
            <span className="ml-topbar__crumb ml-topbar__crumb--current">{match.item.label}</span>
          </>
        )}
      </div>
      {match?.exact && selectie !== null && (
        <Button buttonStyle="pill" size="small" icon={[isGekozen ? "x" : "plus"]} onClick={toggleDashboard}>
          {isGekozen ? "Verwijderen van dashboard" : "Toevoegen aan dashboard"}
        </Button>
      )}
    </div>
  );
}
