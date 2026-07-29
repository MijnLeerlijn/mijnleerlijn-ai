"use client";

import { DynamicIcon } from "lucide-react/dynamic";
import { FileText } from "lucide-react";
import { normaliseerIconNaam } from "@/lib/data/lucide-icon-lookup";
import { normaliseerKleur } from "@/lib/data/categorie-kleuren";
import type { CategorieKleur } from "@/lib/data/categories";

// Categorie-uiterlijk (2026-07-29): `naam` komt rechtstreeks uit de
// Payload-categorie en kan elke naam uit de volledige Lucide-bibliotheek
// zijn (gekozen via payload/components/CategorieAppearancePicker.tsx) — geen
// handmatig onderhouden iconenkaart meer. `DynamicIcon`
// (lucide-react/dynamic) laadt het icoon lazy op naam; `normaliseerIconNaam`
// (lib/data/lucide-icon-lookup.ts) is de enige overgebleven "hardcoded"
// logica: het normaliseert oude, PascalCase-opgeslagen namen (bv.
// "StickyNote") en valt bij een écht onbekende/lege naam terug op een vast
// standaardicoon.
const KLEUREN: Record<CategorieKleur, { bg: string; fg: string }> = {
  blue: { bg: "bg-blauw/8", fg: "text-blauw" },
  green: { bg: "bg-groen/8", fg: "text-groen" },
  red: { bg: "bg-rood/8", fg: "text-rood" },
  orange: { bg: "bg-oranje/8", fg: "text-oranje" },
  yellow: { bg: "bg-geel/8", fg: "text-[#8a6b03]" },
  purple: { bg: "bg-purple-500/8", fg: "text-purple-600" },
  teal: { bg: "bg-teal-500/8", fg: "text-teal-600" },
  pink: { bg: "bg-pink-500/8", fg: "text-pink-600" },
  slate: { bg: "bg-slate-500/8", fg: "text-slate-600" },
};

interface CategorieIcoonProps {
  naam: string;
  kleur: CategorieKleur;
}

export default function CategorieIcoon({ naam, kleur }: CategorieIcoonProps) {
  const iconNaam = normaliseerIconNaam(naam);
  const c = KLEUREN[normaliseerKleur(kleur)];

  // `DynamicIcon`'s `fallback`-component ontvangt geen props (bevestigd in
  // de broncode van lucide-react) — inline gedefinieerd zodat hij, via
  // closure, wél de juiste kleur krijgt (zowel bij een écht onbekende naam
  // als tijdens het korte laadmoment van de dynamische import).
  function IconFallback() {
    return <FileText size={24} className={c.fg} />;
  }

  return (
    <div className={`flex h-10 w-10 items-center justify-center rounded-full ${c.bg}`}>
      <DynamicIcon name={iconNaam} fallback={IconFallback} size={24} className={c.fg} />
    </div>
  );
}
