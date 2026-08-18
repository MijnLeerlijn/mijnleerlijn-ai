import type { TrainingStatus } from "./monday-links";

// Traineromgeving V1, Ronde 2 (2026-08-19) — één bron van waarheid voor
// status→label/status→Tailwind-klasse, voorheen een losse STATUS_LABEL/
// STATUS_KLEUR-literal uitsluitend in scholen/[school]/page.tsx. Nu ook door
// het dashboard gebruikt (badges bij "Verslag nog invullen"). Puur
// presentationeel — geen wijziging aan TrainingStatus zelf of aan
// bepaalTrainingStatus() (monday-links.ts, leespad, ongewijzigd).
//
// Kleuren zijn Tailwind v4-standaardkleuren (teal/amber/blue/green/grijs),
// GEEN officiële MijnLeerlijn-merkkleuren (het brandbook kent alleen Rood/
// Oranje/Geel/Groen/Blauw/Donkerblauw + een grijsschaal, zie app/globals.css)
// — ze zijn wel al consistent zo gebruikt binnen de traineromgeving én
// elders in de site (bv. CategorieIcoon.tsx/HandleidingenSidebar.tsx).
// Bewuste keuze om dit bestaande, consistente gebruik te centraliseren i.p.v.
// een nieuwe mapping op de 6-kleuren-brandbook te forceren.
export const TRAINING_STATUS_LABEL: Record<TrainingStatus, string> = {
  open: "Nieuw",
  gepland: "Gepland",
  gedaan: "Gedaan",
  geannuleerd: "Geannuleerd",
};

export const TRAINING_STATUS_KLEUR: Record<TrainingStatus, string> = {
  open: "bg-amber-50 text-amber-700",
  gepland: "bg-blue-50 text-blue-700",
  gedaan: "bg-green-50 text-green-700",
  geannuleerd: "bg-grijs-100 text-grijs-600",
};

/** Randkleur-variant — nieuw in Ronde 2, voor de bewerkdialoog (statuskeuze/kaartaccent). Zelfde kleurfamilies als hierboven, alleen als rand i.p.v. vlakvulling. */
export const TRAINING_STATUS_RAND: Record<TrainingStatus, string> = {
  open: "border-amber-300",
  gepland: "border-blue-300",
  gedaan: "border-green-300",
  geannuleerd: "border-grijs-300",
};
