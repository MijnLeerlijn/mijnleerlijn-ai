"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, ChevronDown, Download } from "lucide-react";
import Input from "@/components/atoms/Input";
import Skeleton from "@/components/atoms/Skeleton";
import CategorieIcoon from "@/components/atoms/CategorieIcoon";
import type { CategorieKleur } from "@/lib/data/categories";

interface PublicManual {
  id: number;
  title: string;
  kind: "handleiding" | "pdf";
  href: string | null;
  downloadable: boolean;
}

interface PublicCategory {
  id: number;
  slug: string;
  title: string;
  icon: string;
  color?: CategorieKleur;
  manuals: PublicManual[];
}

type Status = "laden" | "klaar" | "fout";

// Sticky "Handleidingen"-sidebar op de helpdesk-homepage (Helpdesk MVP 1.0)
// — haalt ÉÉN keer de volledige zichtbare, gecategoriseerde lijst op
// (GET /api/knowledge/public-manuals, geen login) en filtert/groepeert
// verder client-side. Categorieën zijn uitklapbaar (accordeon), standaard
// dichtgeklapt — bij een actieve zoekopdracht staan alle categorieën met
// een treffer automatisch open, zodat zoeken nooit "niets lijkt te doen".
//
// Livegang-afwerking ("meer kleur volgens het brandbook"): elke categorie
// heeft in het CMS al een eigen merkkleur (payload/collections/Categories.ts)
// — voorheen hardcoded op "blauw" voor iedereen omdat de publieke route die
// kleur nog niet meestuurde. Nu functioneel: het icoon EN de achtergrond
// van een opengeklapte categorie gebruiken de eigen kleur, dus de kleur
// helpt onderscheiden i.p.v. puur decoratief te zijn. "blauw" blijft de
// terugvalwaarde voor een categorie zonder (geldige) kleur.
const TERUGVALKLEUR: CategorieKleur = "blue";

// Statische klasse-per-kleur (geen dynamische `bg-${kleur}` template-string
// — Tailwind v4 herkent alleen letterlijk voorkomende klassen, zelfde reden
// als de KLEUREN-lookup in components/atoms/CategorieIcoon.tsx).
const OPEN_ACHTERGROND: Record<CategorieKleur, string> = {
  blue: "bg-blauw/6",
  green: "bg-groen/6",
  red: "bg-rood/6",
  orange: "bg-oranje/6",
  yellow: "bg-geel/6",
  purple: "bg-purple-500/6",
  teal: "bg-teal-500/6",
  pink: "bg-pink-500/6",
  slate: "bg-slate-500/6",
};

export default function HandleidingenSidebar() {
  const [status, setStatus] = useState<Status>("laden");
  const [categorieen, setCategorieen] = useState<PublicCategory[]>([]);
  const [zoekterm, setZoekterm] = useState("");
  const [open, setOpen] = useState<Set<number>>(new Set());

  useEffect(() => {
    let actief = true;
    fetch("/api/knowledge/public-manuals")
      .then((res) => {
        if (!res.ok) throw new Error("mislukt");
        return res.json();
      })
      .then((data: { categories: PublicCategory[] }) => {
        if (!actief) return;
        setCategorieen(data.categories);
        setStatus("klaar");
      })
      .catch(() => {
        if (actief) setStatus("fout");
      });
    return () => {
      actief = false;
    };
  }, []);

  const gefilterd = useMemo(() => {
    const term = zoekterm.trim().toLowerCase();
    if (!term) return categorieen;
    return categorieen
      .map((categorie) => ({
        ...categorie,
        manuals: categorie.manuals.filter((m) => m.title.toLowerCase().includes(term)),
      }))
      .filter((categorie) => categorie.manuals.length > 0);
  }, [categorieen, zoekterm]);

  useEffect(() => {
    if (!zoekterm.trim()) return;
    setOpen(new Set(gefilterd.map((c) => c.id)));
  }, [zoekterm, gefilterd]);

  function toggle(id: number) {
    setOpen((huidig) => {
      const nieuw = new Set(huidig);
      if (nieuw.has(id)) nieuw.delete(id);
      else nieuw.add(id);
      return nieuw;
    });
  }

  return (
    <aside id="handleidingen" className="lg:sticky lg:top-20 lg:self-start">
      <h2 className="text-h3 font-semibold text-grijs-900">Handleidingen</h2>

      <div className="relative mt-3">
        <Search size={18} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-grijs-400" />
        <Input
          type="text"
          placeholder="Zoek een handleiding..."
          aria-label="Zoek een handleiding"
          value={zoekterm}
          onChange={(e) => setZoekterm(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="mt-4 flex flex-col gap-1">
        {status === "laden" && (
          <div className="flex flex-col gap-2 py-2">
            <Skeleton variant="rij" />
            <Skeleton variant="rij" />
            <Skeleton variant="rij" />
          </div>
        )}

        {status === "fout" && (
          <p className="py-2 text-sm text-grijs-500">
            De handleidingenlijst kon nu niet geladen worden.
          </p>
        )}

        {status === "klaar" && gefilterd.length === 0 && (
          <p className="py-2 text-sm text-grijs-500">
            {zoekterm ? "Geen handleidingen gevonden." : "Er zijn nog geen handleidingen zichtbaar gemaakt."}
          </p>
        )}

        {status === "klaar" &&
          gefilterd.map((categorie) => {
            const isOpen = open.has(categorie.id);
            const kleur = categorie.color ?? TERUGVALKLEUR;
            return (
              <div key={categorie.id} className="border-b border-grijs-100 py-2 last:border-b-0">
                <button
                  type="button"
                  onClick={() => toggle(categorie.id)}
                  aria-expanded={isOpen}
                  className={`flex w-full items-center gap-3 rounded-md py-1.5 text-left transition-colors duration-[120ms] ${
                    isOpen ? OPEN_ACHTERGROND[kleur] : "hover:bg-grijs-50"
                  }`}
                >
                  <CategorieIcoon naam={categorie.icon} kleur={kleur} />
                  <span className="flex-1 text-sm font-medium text-grijs-900">{categorie.title}</span>
                  <ChevronDown
                    size={18}
                    aria-hidden
                    className={`shrink-0 text-grijs-400 transition-transform duration-[120ms] ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {isOpen && (
                  <ul className="ml-[52px] mt-1 flex flex-col gap-1 pb-1">
                    {categorie.manuals.map((manual) => {
                      // PDF's openen als extern bestand in een nieuw tabblad
                      // (zelfde gedrag als voorheen); een handleiding-pagina
                      // is gewone interne navigatie, dus in hetzelfde tabblad.
                      const externLink = manual.kind === "pdf";
                      return (
                        <li key={`${manual.kind}-${manual.id}`} className="flex items-center justify-between gap-2 py-1">
                          <a
                            href={manual.href ?? undefined}
                            target={externLink ? "_blank" : undefined}
                            rel={externLink ? "noopener noreferrer" : undefined}
                            className={`flex-1 text-sm text-grijs-700 ${manual.href ? "hover:text-[var(--variant-accent)] hover:underline" : ""}`}
                          >
                            {manual.title}
                          </a>
                          {manual.downloadable && manual.href && (
                            <a
                              href={manual.href}
                              download
                              aria-label={`Download ${manual.title} als PDF`}
                              className="shrink-0 text-grijs-400 hover:text-[var(--variant-accent)]"
                            >
                              <Download size={16} aria-hidden />
                            </a>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
      </div>
    </aside>
  );
}
