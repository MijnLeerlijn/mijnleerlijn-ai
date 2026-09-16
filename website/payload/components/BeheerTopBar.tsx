"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Button, Link, useAuth, usePreferences } from "@payloadcms/ui";
import { Home } from "lucide-react";
import { findNavItemByPath } from "@/lib/admin-nav/nav-groups";
import { DASHBOARD_PREFERENCE_KEY } from "@/lib/admin-nav/dashboard-preferences";

export function BeheerTopBar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { getPreference, setPreference } = usePreferences();
  const match = findNavItemByPath(pathname ?? "");
  const [selectie, setSelectie] = useState<string[] | null>(null);
  const restricted = user?.permissionMode === "restricted";

  useEffect(() => {
    if (restricted) return;
    let actief = true;
    void (async () => {
      const waarde = await getPreference<string[]>(DASHBOARD_PREFERENCE_KEY);
      if (actief) setSelectie(Array.isArray(waarde) ? waarde : []);
    })();
    return () => { actief = false; };
  }, [getPreference, restricted]);

  if (restricted) return null;

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
            <span className="ml-topbar__sep" aria-hidden="true">/</span>
            <span className="ml-topbar__crumb">{match.group.label}</span>
            <span className="ml-topbar__sep" aria-hidden="true">/</span>
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