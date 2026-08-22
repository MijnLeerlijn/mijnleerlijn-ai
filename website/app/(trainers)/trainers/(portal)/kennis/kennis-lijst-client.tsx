"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, FileText } from "lucide-react";
import type { TrainerKennisversieOverzicht } from "@/lib/trainers/kennis";

// Vervolgronde (2026-08-22) — zelfde "server haalt op, client-eiland
// filtert" -opsplitsing als scholen-lijst-client.tsx: /kennis/page.tsx
// blijft de server-side auth-gate + de ene leesquery; dit component filtert
// uitsluitend in-memory op de al opgehaalde, al alfabetisch gesorteerde
// lijst (haalGepubliceerdeKennisversies, lib/trainers/kennis.ts) — geen
// aparte zoekaanroep per toetsaanslag. "Houd het rustig en eenvoudig"
// (opdrachtseis) — geen categorieën/filters, uitsluitend een zoekbalk.
export function KennisLijstClient({ kennisversies }: { kennisversies: TrainerKennisversieOverzicht[] }) {
  const [zoekterm, setZoekterm] = useState("");

  const genormaliseerdeZoekterm = zoekterm.trim().toLowerCase();
  const gefilterd = genormaliseerdeZoekterm
    ? kennisversies.filter((k) => k.titel.toLowerCase().includes(genormaliseerdeZoekterm) || k.samenvatting.toLowerCase().includes(genormaliseerdeZoekterm))
    : kennisversies;

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

      {gefilterd.length === 0 ? (
        <div className="rounded-xl border border-grijs-200 bg-white p-6 text-body-sm text-grijs-600 shadow-sm">
          {zoekterm ? `Geen kennisartikelen gevonden voor "${zoekterm}".` : "Nog geen kennisartikelen gepubliceerd."}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-grijs-100 rounded-xl border border-grijs-200 bg-white shadow-sm">
          {gefilterd.map((kennisversie) => (
            <Link
              key={kennisversie.id}
              href={`/kennis/${kennisversie.id}`}
              className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-grijs-50"
            >
              <FileText size={16} className="mt-0.5 shrink-0 text-grijs-400" />
              <div className="min-w-0 flex-1">
                <p className="text-body-sm font-medium text-grijs-900">{kennisversie.titel}</p>
                <p className="mt-0.5 truncate text-label text-grijs-600">{kennisversie.samenvatting}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
