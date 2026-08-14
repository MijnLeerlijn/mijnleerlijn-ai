// Sales-assistent V1 (2026-08-14) — de enige plek waar Monday board-/
// column-ID's van "1: Scholen (Master Data)" hardcoded staan. Live bevestigd
// via read-only onderzoek deze sessie (zie de sessiegeschiedenis) — GEEN
// enkele waarde hier is verzonnen. Elke aanroeper (sync/enrichment/backfill/
// writeback) importeert hieruit, nooit een los, eigen kopietje van een
// column-ID — voorkomt dat een tikfout in één bestand stilzwijgend naar de
// verkeerde Monday-kolom leest/schrijft.

/** Board "1: Scholen (Master Data)" — het enige board dat Sales V1 synchroniseert. */
export const SCHOLEN_BOARD_ID = "18420120365";

export const SCHOLEN_KOLOM = {
  typeSchool: "dropdown_mm4v9rvg",
  relatiestatus: "color_mm4vvg4r",
  salesfase: "color_mm4vkv86",
  datumEersteContact: "date_mm5qw30c",
  datumLaatsteContact: "date_mm5q1phd",
  datumVolgendeActie: "date_mm5qswfk",
  hoofdcontactpersoon: "board_relation_mm4v8fpm",
  location: "text_mm5r9kn2",
  binnengekomenVia: "dropdown_mm5qpp3q",
} as const;

/**
 * De enige 3 kolommen waar Sales V1 ooit naar mag terugschrijven — expliciet
 * afgesproken in de sessiegeschiedenis. `voerMondayMutatieUit()`
 * (lib/sales/writeback.ts) accepteert uitsluitend dit type, nooit een losse
 * string — een zichtbare kolomnaam of een niet-toegestane kolom-ID kan er
 * daardoor per ontwerp nooit ingeslopen zijn.
 */
export type SchrijfbareKolomId =
  | typeof SCHOLEN_KOLOM.datumLaatsteContact
  | typeof SCHOLEN_KOLOM.datumVolgendeActie
  | typeof SCHOLEN_KOLOM.typeSchool;

/**
 * Live bevestigde, echte waarden van "Type school" (dropdown_mm4v9rvg) —
 * GEEN Dalton/Jenaplan/Vrijeschool/SBO/regulier, ook al zijn dat in de
 * praktijk gangbare Nederlandse onderwijstypen. Verzin nooit een 4e waarde.
 */
export const TYPE_SCHOOL_WAARDEN = ["Anders organiseren", "Domein onderwijs", "Montessori"] as const;

/**
 * Live bevestigde Relatiestatus-labels (color_mm4vvg4r) — komen woordelijk
 * overeen met de 6 boardgroepen. "Openstaand" (backfill.ts) is hierop
 * gebaseerd, niet geraden.
 */
export const RELATIESTATUS_OPENSTAAND = ["Lead", "Prospect", "Wacht op handtekening"] as const;
export const RELATIESTATUS_GESLOTEN = ["Klant", "Gestopt", "Inactief"] as const;

export function isOpenstaandeRelatiestatus(relatiestatus: string | null | undefined): boolean {
  if (!relatiestatus) return false;
  return (RELATIESTATUS_OPENSTAAND as readonly string[]).includes(relatiestatus);
}

/**
 * Letterlijke marker aan het begin van een gemigreerde Update-tekst
 * ("📜 Gemigreerde CRM-gegevens (oud Sales-board)") — live aangetroffen deze
 * sessie op meerdere schoolitems. Een Update met deze marker telt NOOIT als
 * actueel contactmoment (de `created_at` van zo'n Update is de migratiedatum,
 * niet de echte historische contactdatum) — zie lib/sales/sync.ts.
 */
export const MIGRATIE_MARKER = "📜 Gemigreerde CRM-gegevens";

export function isGemigreerdeUpdate(tekst: string): boolean {
  return tekst.trimStart().startsWith(MIGRATIE_MARKER);
}

/**
 * Sales UX V2 (2026-08-14) — root cause van "verkeerde datum in het
 * logboek": voor een gemigreerde Update is `update.created_at` (Monday's
 * eigen tijdstempel) de MIGRATIEDATUM, niet de echte historische
 * contactdatum. Die echte datum staat als platte tekst ergens vooraan in
 * `text_body` zelf. Deze functie probeert 'm te herkennen — CONSERVATIEF:
 * precies één patroon, gebaseerd op precies één live-bevestigd voorbeeld
 * ("13/March/2026", zie de sessiegeschiedenis). Bewust NIET uitgebreid met
 * ongeverifieerde varianten (NL-maandnamen, DD-MM-JJJJ, "Laatste contact:
 * ..."-labels e.d.) — bij twijfel/geen match: null, nooit gokken. Zie het
 * opleverrapport voor de aanbeveling om dit patroon te herzien zodra er meer
 * echte voorbeelden beschikbaar zijn.
 *
 * Verandert NIETS aan `isGemigreerdeUpdate`/de `gemigreerd`-vlag: een
 * gemigreerde Update blijft altijd uitgesloten van "recente/betrouwbare
 * activiteit" (lib/sales/sync.ts, lib/sales/backfill.ts), ook als de datum
 * hier wél herkend wordt — een herkende datum maakt de INHOUD niet actueel.
 */
const ENGELSE_MAANDEN: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

const GEMIGREERDE_DATUM_PATROON = /\b(\d{1,2})\/([A-Za-z]+)\/(\d{4})\b/;
const ZOEKVENSTER_LENGTE = 300;

export function probeerGemigreerdeDatumTeExtraheren(tekst: string): string | null {
  const match = GEMIGREERDE_DATUM_PATROON.exec(tekst.slice(0, ZOEKVENSTER_LENGTE));
  if (!match) return null;

  const [, dagTekst, maandNaam, jaarTekst] = match as unknown as [string, string, string, string];
  const maand = ENGELSE_MAANDEN[maandNaam.toLowerCase()];
  if (maand === undefined) return null;

  const dag = Number(dagTekst);
  const jaar = Number(jaarTekst);
  if (!Number.isInteger(dag) || dag < 1 || dag > 31) return null;
  if (!Number.isInteger(jaar) || jaar < 2000 || jaar > 2100) return null;

  const datum = new Date(Date.UTC(jaar, maand, dag));
  // Ongeldige kalenderdatum (bv. 31 februari) rolt in JS door naar de
  // volgende maand i.p.v. te falen — expliciet terugvalideren, nooit gokken.
  if (datum.getUTCFullYear() !== jaar || datum.getUTCMonth() !== maand || datum.getUTCDate() !== dag) return null;

  return datum.toISOString();
}
