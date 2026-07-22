"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

const states = [
  { key: "eerste-bezoek", label: "1. Eerste bezoek" },
  { key: "recent-bekeken", label: "2. Verder waar je gebleven was" },
];

export default function DemoSwitcher() {
  const searchParams = useSearchParams();
  const current = searchParams.get("state") ?? "eerste-bezoek";

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-grijs-700 bg-grijs-900/95 backdrop-blur">
      <div className="mx-auto max-w-[1200px] px-4 py-3">
        <p className="mb-2 text-[10px] font-semibold tracking-[0.08em] text-white/50 uppercase">
          Prototype — schakel tussen states (niet onderdeel van het echte product)
        </p>
        <div className="flex flex-wrap gap-2">
          {states.map((s) => (
            <Link
              key={s.key}
              href={`/?state=${s.key}`}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-[120ms] ${
                current === s.key
                  ? "bg-blauw text-white"
                  : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
              }`}
            >
              {s.label}
            </Link>
          ))}
          <Link
            href="/artikel/doelenset-koppelen-aan-leerlingen"
            className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors duration-[120ms] hover:bg-white/20 hover:text-white"
          >
            Kennisartikel →
          </Link>
          <Link
            href="/categorie/doelen-planning"
            className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors duration-[120ms] hover:bg-white/20 hover:text-white"
          >
            Categorie-overzicht →
          </Link>
          <Link
            href="/zoeken?q=Hoe%20verwijder%20ik%20iets"
            className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors duration-[120ms] hover:bg-white/20 hover:text-white"
          >
            Zoeken: meerdere opties →
          </Link>
          <Link
            href="/zoeken?q=onbestaandevraagoveriets"
            className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors duration-[120ms] hover:bg-white/20 hover:text-white"
          >
            Zoeken: geen antwoord →
          </Link>
          <Link
            href="/zoeken?q=test&fout=1"
            className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors duration-[120ms] hover:bg-white/20 hover:text-white"
          >
            Zoeken: technische fout →
          </Link>
        </div>
      </div>
    </div>
  );
}
