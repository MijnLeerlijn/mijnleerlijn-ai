"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import Chip from "@/components/atoms/Chip";
import EmptyState from "@/components/molecules/EmptyState";
import { focusRing } from "@/utils/focus-ring";

export interface CategorieOverzichtItem {
  titel: string;
  samenvatting: string;
  laatstBijgewerkt: string;
  href: string;
  tags?: string[];
}

interface CategoryOverviewProps {
  categorieTitel: string;
  categorieUitleg: string;
  subcategorieen: string[];
  artikelen: CategorieOverzichtItem[];
}

const ALLE_ONDERWERPEN = "Alle onderwerpen";

// Zie docs/UX-DESIGN.md scherm 6. Subcategorie-filter (op tag) + artikelenlijst.
export default function CategoryOverview({
  categorieTitel,
  categorieUitleg,
  subcategorieen,
  artikelen,
}: CategoryOverviewProps) {
  const [actief, setActief] = useState(ALLE_ONDERWERPEN);
  const zichtbareArtikelen =
    actief === ALLE_ONDERWERPEN ? artikelen : artikelen.filter((a) => a.tags?.includes(actief));

  return (
    <div>
      <h1 className="text-h1 font-bold text-grijs-900">{categorieTitel}</h1>
      <p className="mt-2 max-w-2xl text-base text-grijs-600">{categorieUitleg}</p>

      <div className="mt-8 lg:grid lg:grid-cols-[220px_1fr] lg:gap-12">
        <aside className="mb-6 flex gap-2 overflow-x-auto lg:mb-0 lg:flex-col lg:overflow-visible">
          <Chip selected={actief === ALLE_ONDERWERPEN} onClick={() => setActief(ALLE_ONDERWERPEN)}>
            {ALLE_ONDERWERPEN}
          </Chip>
          {subcategorieen.map((subcategorie) => (
            <Chip
              key={subcategorie}
              selected={subcategorie === actief}
              onClick={() => setActief(subcategorie)}
            >
              {subcategorie}
            </Chip>
          ))}
        </aside>

        <div className="flex flex-col">
          {zichtbareArtikelen.length === 0 ? (
            <EmptyState
              icon={FileText}
              titel="Nog geen artikelen in dit onderwerp"
              beschrijving="Gebruik de zoekbalk of stel je vraag via het contactformulier."
            />
          ) : (
            zichtbareArtikelen.map((artikel, index) => (
              <a
                key={artikel.titel}
                href={artikel.href}
                className={`flex items-start gap-3 rounded-sm py-4 hover:text-[var(--variant-accent)] ${focusRing} ${index !== 0 ? "border-t border-grijs-100" : ""}`}
              >
                <FileText size={20} aria-hidden className="mt-0.5 shrink-0 text-grijs-400" />
                <div>
                  <p className="text-base font-semibold text-grijs-900">{artikel.titel}</p>
                  <p className="mt-1 text-sm text-grijs-600">{artikel.samenvatting}</p>
                  <p className="mt-1 text-xs text-grijs-400">Bijgewerkt: {artikel.laatstBijgewerkt}</p>
                </div>
              </a>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
