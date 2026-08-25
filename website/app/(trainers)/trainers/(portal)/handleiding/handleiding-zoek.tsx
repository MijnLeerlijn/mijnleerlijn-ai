"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { MarkdownHeading } from "@/lib/content/markdown-headings";

// Handleidingronde (2026-08-25) — opdrachtseis: "voeg bovenaan een
// eenvoudige zoekfunctie toe... zoekresultaten moeten naar het relevante
// hoofdstuk/tussenkopje springen." Bewust een NIEUW, klein component naast
// (niet: in plaats van) de hergebruikte KennisReader/KennisMarkdown — dat
// paar kent nog geen zoekfunctie (Kennis se eigen zoekbalk zoekt over
// MEERDERE documenten heen op de lijstpagina, kennis-lijst-client.tsx; hier
// gaat het om zoeken BINNEN dit ene document). "Springen" is een kaal
// `<a href="#slug">` — zelfde, al bestaande mechanisme als de
// "Bekijk hoofdstuk"-links in kennis-vraag-blok.tsx; geen eigen scroll-JS
// nodig, en geen scroll-behavior:smooth (bestaat nergens in dit project,
// zie app/globals.css — dus hier ook bewust niet toegevoegd).
//
// Matcht uitsluitend op koptekst (niet de volledige lopende tekst): het
// resultaat IS een hoofdstuk/tussenkopje (spec-eis "springen naar hoofdstuk/
// tussenkopje"), dus koptekst is de juiste, eenvoudige granulariteit — geen
// zwaardere full-text-index nodig voor één document.
export interface HandleidingZoekProps {
  headings: MarkdownHeading[];
}

interface Resultaat {
  heading: MarkdownHeading;
  /** Dichtstbijzijnde voorgaande hoofdstuk (niveau 1) — geeft een tussenkopje context in de resultatenlijst. Zelfde hoofdstuk als het resultaat zelf blijft leeg (geen "X > X"). */
  hoofdstuk: string | null;
}

function bouwResultaten(headings: MarkdownHeading[], zoekterm: string): Resultaat[] {
  const genormaliseerd = zoekterm.trim().toLowerCase();
  if (!genormaliseerd) return [];

  let laatsteHoofdstuk: string | null = null;
  const resultaten: Resultaat[] = [];
  for (const heading of headings) {
    if (heading.level === 1) laatsteHoofdstuk = heading.text;
    if (heading.text.toLowerCase().includes(genormaliseerd)) {
      resultaten.push({ heading, hoofdstuk: heading.level === 1 ? null : laatsteHoofdstuk });
    }
  }
  return resultaten;
}

export function HandleidingZoek({ headings }: HandleidingZoekProps) {
  const [zoekterm, setZoekterm] = useState("");
  const resultaten = useMemo(() => bouwResultaten(headings, zoekterm), [headings, zoekterm]);
  const toontResultaten = zoekterm.trim().length > 0;

  return (
    <div className="relative">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-grijs-400" />
        <input
          type="search"
          value={zoekterm}
          onChange={(e) => setZoekterm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setZoekterm("");
          }}
          placeholder="Zoek in de handleiding…"
          aria-label="Zoek in de handleiding"
          className="w-full rounded-lg border border-grijs-300 py-2.5 pl-9 pr-9 text-body-sm text-grijs-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20"
        />
        {zoekterm && (
          <button
            type="button"
            onClick={() => setZoekterm("")}
            aria-label="Zoekterm wissen"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-grijs-400 hover:bg-grijs-100 hover:text-grijs-700"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {toontResultaten && (
        <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-grijs-200 bg-white shadow-lg">
          {resultaten.length === 0 ? (
            <p className="px-4 py-3 text-body-sm text-grijs-600">Geen resultaten voor &ldquo;{zoekterm}&rdquo;.</p>
          ) : (
            <ul className="flex max-h-80 flex-col divide-y divide-grijs-100 overflow-y-auto">
              {resultaten.map((resultaat) => (
                <li key={resultaat.heading.slug}>
                  <a href={`#${resultaat.heading.slug}`} onClick={() => setZoekterm("")} className="block px-4 py-2.5 transition-colors hover:bg-grijs-50">
                    {resultaat.hoofdstuk && <p className="truncate text-label text-grijs-500">{resultaat.hoofdstuk}</p>}
                    <p className="truncate text-body-sm font-medium text-grijs-900">{resultaat.heading.text}</p>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
