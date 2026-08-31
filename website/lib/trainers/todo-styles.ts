import { PhoneIncoming, RotateCcw, FileEdit, FileClock, ClipboardList, type LucideIcon } from "lucide-react";
import type { TodoItem } from "./dashboard";
import { formatKorteDatum, formatKorteDatumTijd } from "@/lib/sales/format-datum";

// Vervolgronde (2026-08-22) — icoon/CTA-labellogica voor de dashboardsectie
// "To do", in een eigen bestand i.p.v. inline in page.tsx: zelfde precedent
// als lib/trainers/activiteit-styles.ts (ACTIVITEIT_ICOON/-LABEL/-KLEUR) —
// page.tsx (een Next.js route-bestand) exporteert bewust GEEN eigen extra
// named exports naast metadata/default, dat is geen bestaand patroon in deze
// portal en dit bestand houdt de pure weergavelogica bovendien direct
// testbaar zonder de route zelf te hoeven importeren.
//
// Labels hergebruiken bewust exact de bestaande bewoording uit
// verslagStatusEnActie (page.tsx) resp. verslagCta (training-rij.tsx) — geen
// nieuwe formulering verzonnen voor dezelfde onderliggende statussen.
export const TODO_ICOON: Record<TodoItem["soort"], LucideIcon> = {
  telefonisch_concept: PhoneIncoming,
  verslag_vastgelopen: RotateCcw,
  concept_gestart: FileEdit,
  verslag_ontbreekt: FileClock,
  startactie: ClipboardList,
};

export const TODO_CTA_LABEL: Record<TodoItem["soort"], string> = {
  telefonisch_concept: "Controleren",
  verslag_vastgelopen: "Verslag afronden",
  concept_gestart: "Verslag afmaken",
  verslag_ontbreekt: "Verslag maken",
  // Startbegeleiding-ronde (2026-09-02) — alleen zinvol als "Verslag maken"
  // wanneer er een gespreksDatum is (dan is trainingId bruikbaar als
  // verslag-kandidaat, zie lib/trainers/startbegeleiding.ts se
  // haalStartactieVoorMutatie); de UI kiest zelf per item welk label hij
  // toont (zie page.tsx), dit is de generieke fallback-tekst.
  startactie: "Bekijken",
};

export function todoTijdLabel(item: TodoItem): string {
  switch (item.soort) {
    case "telefonisch_concept":
      return `Ingesproken op ${formatKorteDatumTijd(item.wanneer)}`;
    case "verslag_vastgelopen":
      return "Nog niet volledig verwerkt naar Monday";
    case "concept_gestart":
      return `Concept gestart op ${formatKorteDatum(item.wanneer)}`;
    case "verslag_ontbreekt":
      return `Training was op ${formatKorteDatum(item.wanneer)}`;
    case "startactie":
      return `Deadline ${formatKorteDatum(item.deadline)}`;
  }
}
