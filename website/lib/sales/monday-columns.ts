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
