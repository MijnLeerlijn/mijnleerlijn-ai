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

// Productiecorrectie 2026-08-16 (vervolg, functionele inconsistentie) —
// root cause: de datumweergave toonde uitsluitend lokale sales-actions, dus
// een school met UITSLUITEND een geldige Monday "Datum volgende actie" (bv.
// Springplank/24 augustus) verscheen nooit op haar eigen geplande dag —
// terwijl diezelfde school elders (To-do se "Gepland in Monday") wél als
// gepland gold. Vandaag/morgen/overmorgen/een aangepaste datum moeten allemaal
// door DEZELFDE gecombineerde agenda lopen (opdrachtseis), nooit een aparte,
// tweede implementatie per weergave.
//
// bepaalGecombineerdeAgenda() hergebruikt bepaalVandaagWeergave() voor het
// lokale-acties-deel (geen dubbele datumvergelijkingslogica) en voegt
// daarna, uitsluitend voor de gekozen dag zelf (nooit voor achterstallig —
// "achterstallige lokale acties alleen bij Vandaag" blijft dus uitsluitend
// lokaal), een Monday-kaart toe per ACTIEVE school wiens
// mondayVolgendeActieDatum exact op gekozenDatum valt. Dedupliceren gebeurt
// op (school, gekozenDatum): een school die al via een lokale actie op
// diezelfde dag verschijnt krijgt nooit ook nog een Monday-kaart. Maakt/wist
// NOOIT een sales-actions-record — puur een afgeleide, virtuele weergave
// (opdrachtseis: "geen nieuwe lokale Sales-action alleen om iets op de
// agenda zichtbaar te maken").
//
// Een verlopen Monday-datum kan hier nog steeds verschijnen als de gebruiker
// zelf terugbladert naar die datum (een letterlijke "wat stond hier
// gepland"-vraag) — dat is een ander, downstream-neutraal geval dan
// "aandacht nodig" (lib/sales/aandacht-nodig.ts se heeftGeldigeMondayPlanning,
// TOV vandaag), dat ongewijzigd blijft: alleen een NIET-verlopen datum telt
// daar als "al gepland".
export type AgendaBron = "sales" | "monday";

export interface AgendaActieInvoer extends ActieVoorVandaag {
  id: number;
  description: string;
  type: string;
  channel?: string;
  schoolId: number;
  schoolName: string;
  relatiestatus: string | null;
  plaats: string | null;
}

export interface AgendaSalesActie extends AgendaActieInvoer {
  bron: "sales";
}

export interface AgendaMondayPlanning {
  bron: "monday";
  schoolId: number;
  schoolName: string;
  relatiestatus: string | null;
  plaats: string | null;
  datum: string;
  /** lib/sales/actie-extractie.ts se gecachete omschrijving — null wanneer nog niet (succesvol) geëxtraheerd. */
  geplandeActieTekst: string | null;
}

export type AgendaItem = AgendaSalesActie | AgendaMondayPlanning;

export interface SchoolMetMondayPlanning {
  id: number;
  schoolName: string;
  relatiestatus: string | null;
  plaats: string | null;
  actief: boolean;
  mondayVolgendeActieDatum: string | null;
  cachedGeplandeActieTekst: string | null;
}

export interface GecombineerdeAgendaWeergave {
  gekozenDatum: string;
  isVandaag: boolean;
  /** Uitsluitend lokale Sales-acties — nooit Monday-kaarten (opdrachtseis). */
  achterstallig: AgendaSalesActie[];
  /** Sales-acties + niet-gedupliceerde Monday-planningen, samen op de gekozen dag. */
  opGekozenDatum: AgendaItem[];
}

export function bepaalGecombineerdeAgenda(
  acties: AgendaActieInvoer[],
  scholenMetMondayPlanning: SchoolMetMondayPlanning[],
  gekozenDatum: string
): GecombineerdeAgendaWeergave {
  const basis = bepaalVandaagWeergave(acties, gekozenDatum);
  const schoolIdsMetActieOpGekozenDatum = new Set(basis.opGekozenDatum.map((a) => a.schoolId));

  const mondayKaarten: AgendaMondayPlanning[] = scholenMetMondayPlanning
    .filter(
      (s) =>
        s.actief &&
        s.mondayVolgendeActieDatum?.slice(0, 10) === gekozenDatum &&
        !schoolIdsMetActieOpGekozenDatum.has(s.id)
    )
    .map((s) => ({
      bron: "monday",
      schoolId: s.id,
      schoolName: s.schoolName,
      relatiestatus: s.relatiestatus,
      plaats: s.plaats,
      datum: gekozenDatum,
      geplandeActieTekst: s.cachedGeplandeActieTekst,
    }));

  return {
    gekozenDatum,
    isVandaag: basis.isVandaag,
    achterstallig: basis.achterstallig.map((a) => ({ ...a, bron: "sales" as const })),
    opGekozenDatum: [...basis.opGekozenDatum.map((a) => ({ ...a, bron: "sales" as const })), ...mondayKaarten],
  };
}
