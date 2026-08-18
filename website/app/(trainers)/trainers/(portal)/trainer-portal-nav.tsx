"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, School, CircleUserRound, LogOut } from "lucide-react";

// Alle hrefs hieronder zijn het KALE pad zoals de browser dat ziet (de
// proxy.ts-rewrite naar /trainers/* is voor de browser onzichtbaar) — zie de
// toelichting in ../layout.tsx over waarom dit nooit "/trainers/..." mag zijn.
const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/scholen", label: "Mijn scholen", icon: School, exact: false },
  { href: "/profiel", label: "Profiel", icon: CircleUserRound, exact: false },
] as const;

function isActief(pathname: string, href: string, exact: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

// Compacte, vaste (sticky) topnav — bewust GEEN sidebar: met 3 menu-items +
// uitloggen past dit ruim op één rij, ook op mobiel (labels verdwijnen onder
// sm:, icoon blijft altijd zichtbaar) — zie architectuurrapport §11
// ("compacte vaste navigatie", expliciet niet de Payload-adminlook).
export function TrainerPortalNav({ trainerNaam }: { trainerNaam: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [bezigMetUitloggen, setBezigMetUitloggen] = useState(false);

  async function handleUitloggen() {
    setBezigMetUitloggen(true);
    try {
      await fetch("/api/trainer-accounts/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-grijs-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Image src="/brand/beeldmerk-kleur.png" alt="" width={28} height={28} className="h-7 w-7" />
          <span className="font-display text-base font-bold text-donkerblauw">Trainers</span>
        </Link>

        <nav aria-label="Trainerportal" className="flex items-center gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
            const actief = isActief(pathname, href, exact);
            return (
              <Link
                key={href}
                href={href}
                aria-current={actief ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-body-sm font-medium transition-colors sm:px-3 ${
                  actief ? "bg-teal-50 text-teal-700" : "text-grijs-600 hover:bg-grijs-100 hover:text-grijs-900"
                }`}
              >
                <Icon size={18} className="shrink-0" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden max-w-[10rem] truncate text-body-sm text-grijs-600 md:inline">{trainerNaam}</span>
          <button
            type="button"
            onClick={handleUitloggen}
            disabled={bezigMetUitloggen}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-body-sm font-medium text-grijs-600 transition-colors hover:bg-grijs-100 hover:text-grijs-900 disabled:opacity-50"
          >
            <LogOut size={18} />
            <span className="hidden sm:inline">{bezigMetUitloggen ? "Bezig…" : "Uitloggen"}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
