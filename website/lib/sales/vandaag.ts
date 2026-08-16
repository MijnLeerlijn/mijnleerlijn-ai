import { vandaagIso } from "./format-datum";

// Sales-logica productiecorrectie 2026-08-16 (punt 2) — de "Vandaag"-tab op
// het dashboard toont voortaan een DOOR DE GEBRUIKER GEKOZEN datum, niet
// alleen de huidige kalenderdag. Puur, GEEN Payload-afhankelijkheid — zelfde
// reden als lib/sales/aandacht-nodig.ts se heeftGeldigeMondayPlanning: deze
// logica draait client-side (SalesDashboardPaneel.tsx leest via Payload's
// REST-API, niet de Local API) en moet dus zonder server-only imports
// werken, ook al staat het bestand in lib/sales/.
export interface ActieVoorVandaag {
  dueDate: string;
}

export interface VandaagWeergave<T extends ActieVoorVandaag> {
  gekozenDatum: string;
  isVandaag: boolean;
  /** Alleen gevuld wanneer gekozenDatum vandaag zelf is — nooit vermengd met een toekomstige datum (opdrachtseis). */
  achterstallig: T[];
  opGekozenDatum: T[];
}

/**
 * Bepaalt welke open Sales-acties bij een gekozen datum horen.
 * Datumvergelijking gebeurt uitsluitend op de al-lokale YYYY-MM-DD-substring
 * van dueDate (zelfde conventie als de bestaande urgentieVanActie-helpers in
 * SalesDashboardPaneel.tsx/SalesVandaagView.tsx) tegen vandaagIso()/
 * gekozenDatum — beide al timezone-veilig berekend, dus geen
 * UTC-datumverschuiving hier.
 */
export function bepaalVandaagWeergave<T extends ActieVoorVandaag>(acties: T[], gekozenDatum: string): VandaagWeergave<T> {
  const vandaag = vandaagIso();
  const isVandaag = gekozenDatum === vandaag;
  const opGekozenDatum = acties.filter((a) => a.dueDate.slice(0, 10) === gekozenDatum);
  const achterstallig = isVandaag ? acties.filter((a) => a.dueDate.slice(0, 10) < vandaag) : [];
  return { gekozenDatum, isVandaag, achterstallig, opGekozenDatum };
}

/** Snelkeuzes voor de datumnavigatie — vaste offsets t.o.v. vandaagIso(), zie SalesDashboardPaneel.tsx. */
export const VANDAAG_SNELKEUZES = [
  { label: "Vandaag", dagenVanaf: 0 },
  { label: "Morgen", dagenVanaf: 1 },
  { label: "Overmorgen", dagenVanaf: 2 },
] as const;
