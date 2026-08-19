import type { TrainingStatus } from "./monday-links";

// Traineromgeving V1, Ronde 2 (2026-08-19) — één bron van waarheid voor
// status→label/status→Tailwind-klasse, voorheen een losse STATUS_LABEL/
// STATUS_KLEUR-literal uitsluitend in scholen/[school]/page.tsx. Nu ook door
// het dashboard gebruikt (badges bij "Verslag nog invullen"). Puur
// presentationeel — geen wijziging aan TrainingStatus zelf of aan
// bepaalTrainingStatus() (monday-links.ts, leespad, ongewijzigd).
//
// Kleuren zijn Tailwind v4-standaardkleuren (amber/blue/green/red), GEEN
// officiële MijnLeerlijn-merkkleuren (het brandbook kent alleen Rood/Oranje/
// Geel/Groen/Blauw/Donkerblauw + een grijsschaal, zie app/globals.css) — ze
// zijn wel al consistent zo gebruikt binnen de traineromgeving én elders in
// de site (bv. CategorieIcoon.tsx/HandleidingenSidebar.tsx). Bewuste keuze
// om dit bestaande, consistente gebruik te centraliseren i.p.v. een nieuwe
// mapping op de 6-kleuren-brandbook te forceren.
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
  // Ronde 2 vervolg (2026-08-19) — expliciet gewijzigd van grijs naar rood,
  // opdrachtseis (Monday-referentie: Nieuw=oranje/Gepland=blauw/Gedaan=groen/
  // Geannuleerd=rood). Een geannuleerde training verdient een duidelijk
  // afwijkende, "let op"-kleur i.p.v. onopvallend grijs.
  geannuleerd: "bg-red-50 text-red-700",
};

/** Randkleur-variant — voor kaartaccenten/focusstates. Zelfde kleurfamilies als hierboven, alleen als rand i.p.v. vlakvulling. */
export const TRAINING_STATUS_RAND: Record<TrainingStatus, string> = {
  open: "border-amber-300",
  gepland: "border-blue-300",
  gedaan: "border-green-300",
  geannuleerd: "border-red-300",
};

/**
 * Ronde 2 vervolg (2026-08-19) — vlakgevulde ("solid") variant, nieuw voor de
 * StatusPopover: 4 grote, direct klikbare gekleurde keuzes (Monday-stijl
 * bediening, zie opdracht), i.p.v. de lichte badge-vulling hierboven. Bewust
 * dezelfde 4 kleurfamilies als TRAINING_STATUS_KLEUR/_RAND — nooit een los
 * vierde kleursysteem ernaast, dat is precies de inconsistentie die deze
 * ronde moet wegnemen. text-white hier al inbegrepen (contrast is voor alle
 * 4 op -600 al voldoende, geen aparte per-kleur tekstkleur nodig).
 */
export const TRAINING_STATUS_SOLID: Record<TrainingStatus, string> = {
  open: "bg-amber-500 text-white hover:bg-amber-600",
  gepland: "bg-blue-600 text-white hover:bg-blue-700",
  gedaan: "bg-green-600 text-white hover:bg-green-700",
  geannuleerd: "bg-red-600 text-white hover:bg-red-700",
};

/** Zachte, geselecteerde ring-variant voor de HUIDIGE status binnen de solid-popoverkeuzes — toont welke optie al actief is zonder een aparte "geselecteerd"-tekst nodig te hebben. */
export const TRAINING_STATUS_SELECTED_RING: Record<TrainingStatus, string> = {
  open: "ring-2 ring-offset-2 ring-amber-500",
  gepland: "ring-2 ring-offset-2 ring-blue-600",
  gedaan: "ring-2 ring-offset-2 ring-green-600",
  geannuleerd: "ring-2 ring-offset-2 ring-red-600",
};
