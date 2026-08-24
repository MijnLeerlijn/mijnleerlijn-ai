"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, FileText, Hash } from "lucide-react";
import type { TrainerKennisversieOverzicht } from "@/lib/trainers/kennis";

// Vervolgronde (2026-08-22) — zelfde "server haalt op, client-eiland
// filtert" -opsplitsing als scholen-lijst-client.tsx: /kennis/page.tsx
// blijft de server-side auth-gate + de ene leesquery; dit component filtert
// uitsluitend in-memory op de al opgehaalde, al alfabetisch gesorteerde
// lijst (haalGepubliceerdeKennisversies, lib/trainers/kennis.ts) — geen
// aparte zoekaanroep per toetsaanslag. "Houd het rustig en eenvoudig"
// (opdrachtseis) — geen categorieën/filters, uitsluitend een zoekbalk.
//
// Vervolgronde (2026-08-24) — "hoofdstuknavigatie + bronverwijzing"
// (opdrachtseis §7): de zoekfunctie matcht sindsdien ook op hoofdstuktitel
// (k.headings, zie lib/trainers/kennis.ts), niet uitsluitend op documenttitel/
// -samenvatting. Een hoofdstuk-match linkt rechtstreeks naar dat hoofdstuk
// (/kennis/[id]#slug) — voor V1 is de hoofdstuktekst zelf de "korte veilige
// snippet" (al kort, al platte tekst, geen aparte content-extractie nodig).
// Zonder zoekterm blijft de lijst exact zoals voorheen: één rij per document.

interface Zoekresultaat {
  sleutel: string;
  href: string;
  documentTitel: string;
  /** Hoofdstuktekst bij een hoofdstuk-match, anders de documentsamenvatting. */
  ondertitel: string;
  isHoofdstuk: boolean;
}

function bouwZoekresultaten(kennisversies: TrainerKennisversieOverzicht[], zoekterm: string): Zoekresultaat[] {
  const resultaten: Zoekresultaat[] = [];
  for (const k of kennisversies) {
    if (k.titel.toLowerCase().includes(zoekterm) || k.samenvatting.toLowerCase().includes(zoekterm)) {
      resultaten.push({ sleutel: `${k.id}`, href: `/kennis/${k.id}`, documentTitel: k.titel, ondertitel: k.samenvatting, isHoofdstuk: false });
    }
    for (const heading of k.headings) {
      if (!heading.text.toLowerCase().includes(zoekterm)) continue;
      resultaten.push({
        sleutel: `${k.id}-${heading.slug}`,
        href: `/kennis/${k.id}#${heading.slug}`,
        documentTitel: k.titel,
        ondertitel: heading.text,
        isHoofdstuk: true,
      });
    }
  }
  return resultaten;
}

export function KennisLijstClient({ kennisversies }: { kennisversies: TrainerKennisversieOverzicht[] }) {
  const [zoekterm, setZoekterm] = useState("");

  const genormaliseerdeZoekterm = zoekterm.trim().toLowerCase();
  const resultaten: Zoekresultaat[] = genormaliseerdeZoekterm
    ? bouwZoekresultaten(kennisversies, genormaliseerdeZoekterm)
    : kennisversies.map((k) => ({ sleutel: `${k.id}`, href: `/kennis/${k.id}`, documentTitel: k.titel, ondertitel: k.samenvatting, isHoofdstuk: false }));

  return (
    <div className="flex flex-col gap-4">
      <div className="relative max-w-sm">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-grijs-400" />
        <input
          type="search"
          value={zoekterm}
          onChange={(e) => setZoekterm(e.target.value)}
          placeholder="Zoek in basiskennis…"
          aria-label="Zoek in basiskennis"
          className="w-full rounded-lg border border-grijs-300 py-2 pl-9 pr-3 text-body-sm text-grijs-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
        />
      </div>

      {resultaten.length === 0 ? (
        <div className="rounded-xl border border-grijs-200 bg-white p-6 text-body-sm text-grijs-600 shadow-sm">
          {zoekterm ? `Geen kennisartikelen gevonden voor "${zoekterm}".` : "Nog geen kennisartikelen gepubliceerd."}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-grijs-100 rounded-xl border border-grijs-200 bg-white shadow-sm">
          {resultaten.map((resultaat) => (
            <Link key={resultaat.sleutel} href={resultaat.href} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-grijs-50">
              {resultaat.isHoofdstuk ? (
                <Hash size={16} className="mt-0.5 shrink-0 text-teal-600" />
              ) : (
                <FileText size={16} className="mt-0.5 shrink-0 text-grijs-400" />
              )}
              <div className="min-w-0 flex-1">
                {resultaat.isHoofdstuk && <p className="truncate text-label text-grijs-500">{resultaat.documentTitel}</p>}
                <p className="truncate text-body-sm font-medium text-grijs-900">{resultaat.isHoofdstuk ? resultaat.ondertitel : resultaat.documentTitel}</p>
                {!resultaat.isHoofdstuk && <p className="mt-0.5 truncate text-label text-grijs-600">{resultaat.ondertitel}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
