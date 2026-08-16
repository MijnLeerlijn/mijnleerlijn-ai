// Sales UX-ronde 3 (2026-08-14) — pure, testbare sorteerlogica voor
// SalesScholenView.tsx se sorteerbare kolomkoppen. Los van de bestaande
// filterlogica (die blijft client-side in de component zelf, zie
// FilterState daar) — sortering werkt op de AL gefilterde lijst, dus de
// twee combineren vanzelf (expliciete opdrachtseis: "filters en sortering
// moeten samen werken").
//
// Nulls/lege waarden sorteren als "" (leeg/onbekend eerst bij oplopend) —
// zelfde conventie als de al bestaande tier-4-sortering in de vroegere
// widget-prioritering.ts: een school zonder laatste-contactdatum is voor
// "oudste eerst"-sortering per definitie de langst-stille (of nooit
// gecontacteerde) school, en hoort dus vooraan.
export type SorteerKolom = "schoolName" | "relatiestatus" | "salesfase" | "onderwijstype" | "plaats" | "laatsteContact" | "volgendeActie";
export type SorteerRichting = "oplopend" | "aflopend";

export interface SorteerbareSchool {
  schoolName: string;
  relatiestatus: string | null;
  /** Productiecorrectie 2026-08-16 (punt 10) — ontbrak nog als sorteerbare kolom. */
  salesfase: string | null;
  onderwijstypeNaam: string | null;
  plaats: string | null;
  lastMondayActivityAt: string | null;
  volgendeActieDatum: string | null;
}

function vergelijkTekst(a: string | null, b: string | null): number {
  return (a ?? "").localeCompare(b ?? "", "nl");
}

function vergelijkDatum(a: string | null, b: string | null): number {
  return (a ?? "").localeCompare(b ?? "");
}

export function vergelijkScholen(a: SorteerbareSchool, b: SorteerbareSchool, kolom: SorteerKolom, richting: SorteerRichting): number {
  let resultaat: number;
  switch (kolom) {
    case "schoolName":
      resultaat = vergelijkTekst(a.schoolName, b.schoolName);
      break;
    case "relatiestatus":
      resultaat = vergelijkTekst(a.relatiestatus, b.relatiestatus);
      break;
    case "salesfase":
      resultaat = vergelijkTekst(a.salesfase, b.salesfase);
      break;
    case "onderwijstype":
      resultaat = vergelijkTekst(a.onderwijstypeNaam, b.onderwijstypeNaam);
      break;
    case "plaats":
      resultaat = vergelijkTekst(a.plaats, b.plaats);
      break;
    case "laatsteContact":
      resultaat = vergelijkDatum(a.lastMondayActivityAt, b.lastMondayActivityAt);
      break;
    case "volgendeActie":
      resultaat = vergelijkDatum(a.volgendeActieDatum, b.volgendeActieDatum);
      break;
  }
  return richting === "oplopend" ? resultaat : -resultaat;
}

export function sorteerScholen<T extends SorteerbareSchool>(scholen: T[], kolom: SorteerKolom | null, richting: SorteerRichting): T[] {
  if (!kolom) return scholen;
  return [...scholen].sort((a, b) => vergelijkScholen(a, b, kolom, richting));
}
