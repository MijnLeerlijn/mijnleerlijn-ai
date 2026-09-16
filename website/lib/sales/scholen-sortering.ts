export type SorteerKolom = "schoolName" | "relatiestatus" | "salesfase" | "onderwijstype" | "binnengekomenVia" | "plaats" | "laatsteContact" | "volgendeActie" | "planningStatus";
export type SorteerRichting = "oplopend" | "aflopend";

export interface SorteerbareSchool {
  schoolName: string;
  relatiestatus: string | null;
  salesfase: string | null;
  onderwijstypeNaam: string | null;
  binnengekomenVia?: string | null;
  plaats: string | null;
  lastMondayActivityAt: string | null;
  volgendeActieDatum: string | null;
  // Planning blijft intern beschikbaar voor bestaande logica/tests, maar is niet meer zichtbaar als Pipeline-kolom.
  planningStatusRang: number;
}

function vergelijkTekst(a: string | null | undefined, b: string | null | undefined): number {
  return (a ?? "").localeCompare(b ?? "", "nl");
}

function vergelijkDatum(a: string | null, b: string | null): number {
  return (a ?? "").localeCompare(b ?? "");
}

export function vergelijkScholen(a: SorteerbareSchool, b: SorteerbareSchool, kolom: SorteerKolom, richting: SorteerRichting): number {
  let resultaat = 0;
  switch (kolom) {
    case "schoolName": resultaat = vergelijkTekst(a.schoolName, b.schoolName); break;
    case "relatiestatus": resultaat = vergelijkTekst(a.relatiestatus, b.relatiestatus); break;
    case "salesfase": resultaat = vergelijkTekst(a.salesfase, b.salesfase); break;
    case "onderwijstype": resultaat = vergelijkTekst(a.onderwijstypeNaam, b.onderwijstypeNaam); break;
    case "binnengekomenVia": resultaat = vergelijkTekst(a.binnengekomenVia, b.binnengekomenVia); break;
    case "plaats": resultaat = vergelijkTekst(a.plaats, b.plaats); break;
    case "laatsteContact": resultaat = vergelijkDatum(a.lastMondayActivityAt, b.lastMondayActivityAt); break;
    case "volgendeActie": resultaat = vergelijkDatum(a.volgendeActieDatum, b.volgendeActieDatum); break;
    case "planningStatus": resultaat = a.planningStatusRang - b.planningStatusRang; break;
  }
  return richting === "oplopend" ? resultaat : -resultaat;
}

export function sorteerScholen<T extends SorteerbareSchool>(scholen: T[], kolom: SorteerKolom | null, richting: SorteerRichting): T[] {
  if (!kolom) return scholen;
  return [...scholen].sort((a, b) => vergelijkScholen(a, b, kolom, richting));
}
