// Sales — centrale Monday board-/column-ID's van "1: Scholen (Master Data)".
// Live bevestigd; aanroepers importeren uitsluitend hieruit.

/** Board "1: Scholen (Master Data)". */
export const SCHOLEN_BOARD_ID = "18420120365";

export const LOGBOEK_SAMENVATTING_MAX_LENGTE = 160;

export const SCHOLEN_KOLOM = {
  typeSchool: "dropdown_mm4v9rvg",
  aantalLeerlingen: "numeric_mm4vyz6j",
  relatiestatus: "color_mm4vvg4r",
  salesfase: "color_mm4vkv86",
  datumEersteContact: "date_mm5qw30c",
  datumLaatsteContact: "date_mm5q1phd",
  datumVolgendeActie: "date_mm5qswfk",
  hoofdcontactpersoon: "board_relation_mm4v8fpm",
  location: "text_mm5r9kn2",
  binnengekomenVia: "dropdown_mm5qpp3q",
  whitelabel: "dropdown_mm4ve3bj",
  klantGeworden: "color_mm6vc6h",
} as const;

/** Alleen deze bestaande Sales V1-kolommen zijn schrijfbaar. Dashboardvelden zijn read-only. */
export type SchrijfbareKolomId =
  | typeof SCHOLEN_KOLOM.datumLaatsteContact
  | typeof SCHOLEN_KOLOM.datumVolgendeActie
  | typeof SCHOLEN_KOLOM.typeSchool;

const SCHRIJFBARE_KOLOM_IDS: readonly string[] = [SCHOLEN_KOLOM.datumLaatsteContact, SCHOLEN_KOLOM.datumVolgendeActie, SCHOLEN_KOLOM.typeSchool];

export function isSchrijfbareKolomId(waarde: string): waarde is SchrijfbareKolomId {
  return SCHRIJFBARE_KOLOM_IDS.includes(waarde);
}

/** Live boardwaarden. Meerdere waarden kunnen bij één school gecombineerd zijn. */
export const TYPE_SCHOOL_WAARDEN = [
  "Anders organiseren",
  "Domein onderwijs",
  "Montessori",
  "Dalton",
  "Vrije school",
  "Klassikaal",
  "Jenaplan",
  "SBO",
  "VSO",
  "Agora",
  "Unit",
  "B3 onderwijs",
] as const;

export const RELATIESTATUS_OPENSTAAND = ["Lead", "Prospect", "Wacht op handtekening"] as const;
export const RELATIESTATUS_GESLOTEN = ["Klant", "Gestopt", "Inactief"] as const;

export function isOpenstaandeRelatiestatus(relatiestatus: string | null | undefined): boolean {
  if (!relatiestatus) return false;
  return (RELATIESTATUS_OPENSTAAND as readonly string[]).includes(relatiestatus);
}

export const MIGRATIE_MARKER = "📜 Gemigreerde CRM-gegevens";

export function isGemigreerdeUpdate(tekst: string): boolean {
  return tekst.trimStart().startsWith(MIGRATIE_MARKER);
}

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
  if (datum.getUTCFullYear() !== jaar || datum.getUTCMonth() !== maand || datum.getUTCDate() !== dag) return null;

  return datum.toISOString();
}
