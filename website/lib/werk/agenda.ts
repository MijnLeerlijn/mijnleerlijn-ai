import { bepaalVandaagWeergave, bepaalGecombineerdeAgenda, type AgendaActieInvoer, type AgendaItem, type SchoolMetMondayPlanning } from "@/lib/sales/vandaag";

// Mijn Werk V1 (2026-08-17) — veralgemenisering van
// bepaalGecombineerdeAgenda() (lib/sales/vandaag.ts, gebouwd voor de
// functionele-inconsistentiefix) met een DERDE, onafhankelijke bron:
// persoonlijke taken. Zelfde architectuur als goedgekeurd (§B): bronrecords
// blijven ongewijzigd (sales-actions, de Monday-cache, personal-tasks), deze
// functie is een pure leesmodel-laag erbovenop — muteert nooit iets, maakt
// nooit een sales-actions-record.
//
// Geen dedup tussen taak en sales/monday (in tegenstelling tot sales↔monday
// hierboven): een persoonlijke taak is nooit hetzelfde onderliggende ding als
// een Sales-actie of Monday-planning, ook niet met dezelfde schoolcontext —
// het blijft een onafhankelijk, apart item (opdrachtseis: "Geen van de
// bronnen wordt door de aggregatielaag gemuteerd").
//
// "Achterstallig" geldt voor taken op dezelfde manier als voor sales-acties:
// alleen een aparte groep bij het bekijken van vandaag zelf (bestaande regel,
// hier doorgetrokken naar taken voor consistentie).
export type WerkBron = "taak" | "sales" | "monday";

export interface TaakInvoer {
  id: number;
  titel: string;
  beschrijving: string | null;
  /** YYYY-MM-DD, of null voor een ongeplande taak (amendement 1). */
  datum: string | null;
  tijd: string | null;
  status: "open" | "afgerond" | "vervallen";
  schoolId: number | null;
  schoolName: string | null;
}

export interface WerkTaakItem {
  bron: "taak";
  id: number;
  titel: string;
  beschrijving: string | null;
  datum: string | null;
  tijd: string | null;
  schoolId: number | null;
  schoolName: string | null;
}

export type WerkItem = WerkTaakItem | AgendaItem;

export interface WerkAgendaWeergave {
  gekozenDatum: string;
  isVandaag: boolean;
  /** Uitsluitend taken/sales-acties — nooit Monday-kaarten (bestaande regel, ongewijzigd). */
  achterstallig: (WerkTaakItem | Extract<AgendaItem, { bron: "sales" }>)[];
  opGekozenDatum: WerkItem[];
  /** Open taken zonder datum — onafhankelijk van gekozenDatum, altijd dezelfde lijst. */
  ongepland: WerkTaakItem[];
}

function naarWerkTaakItem(taak: TaakInvoer): WerkTaakItem {
  return {
    bron: "taak",
    id: taak.id,
    titel: taak.titel,
    beschrijving: taak.beschrijving,
    datum: taak.datum,
    tijd: taak.tijd,
    schoolId: taak.schoolId,
    schoolName: taak.schoolName,
  };
}

export function bepaalWerkAgenda(
  taken: TaakInvoer[],
  acties: AgendaActieInvoer[],
  scholenMetMondayPlanning: SchoolMetMondayPlanning[],
  gekozenDatum: string
): WerkAgendaWeergave {
  const basis = bepaalGecombineerdeAgenda(acties, scholenMetMondayPlanning, gekozenDatum);

  const openTaken = taken.filter((t) => t.status === "open");
  const geplandeTaken = openTaken.filter((t): t is TaakInvoer & { datum: string } => t.datum !== null);
  const ongepland = openTaken.filter((t) => t.datum === null).map(naarWerkTaakItem);

  // Hergebruikt bepaalVandaagWeergave() voor de datumvergelijking van taken —
  // zelfde bron van waarheid als sales/monday, geen tweede
  // datumvergelijkingsimplementatie (zie lib/sales/vandaag.ts se eigen
  // toelichting hierover).
  const taakWeergave = bepaalVandaagWeergave(
    geplandeTaken.map((t) => ({ ...t, dueDate: t.datum })),
    gekozenDatum
  );

  return {
    gekozenDatum,
    isVandaag: basis.isVandaag,
    achterstallig: [...basis.achterstallig, ...taakWeergave.achterstallig.map(naarWerkTaakItem)],
    opGekozenDatum: [...basis.opGekozenDatum, ...taakWeergave.opGekozenDatum.map(naarWerkTaakItem)],
    ongepland,
  };
}
