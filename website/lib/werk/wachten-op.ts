import type { Payload } from "payload";

// Mijn Werk V1 (2026-08-17) — "Wachten op": scholen waar de SCHOOL aan zet
// is, uitsluitend afgeleid uit bestaande Sales-data (opdrachtseis: "Gebruik
// uitsluitend bestaande Sales-data; geen nieuwe Wachten-op-collection").
//
// Enige bestaande bron voor "wie is aan zet": SchoolRelatieAnalyse.wieIsAanZet
// (lib/sales/relationship-analysis.ts), een momentopname die alleen bewaard
// blijft in sales-proposals.relatieAnalyse (JSON) — er bestaat geen los,
// altijd-actueel veld hiervoor op sales-schools zelf (geverifieerd: dat
// bestand heeft geen wieIsAanZet-achtig veld).
//
// Definitie: een actieve school telt als "Wachten op" wanneer er een OPEN
// sales-actions-record bestaat waarvan het bron-voorstel (sourceProposal)
// zijn relatieAnalyse met wieIsAanZet: "school" had. In de praktijk is dat
// precies de check-in-actie die relationship-analysis.ts voorstelt zodra de
// school aan zet is (zie de systeemprompt daar: "stel een concreet
// follow-up-/check-in-moment voor") — dus deze functie voegt geen nieuwe
// interpretatie toe, ze maakt uitsluitend zichtbaar wat al eerder besloten
// is, VÓÓR de check-in-datum zelf aanbreekt (die pas op zijn eigen dueDate in
// de Vandaag-tab verschijnt). "Bestaande vervolgdatum" en "wanneer opvolgen
// logisch wordt" zijn in dit ontwerp bewust hetzelfde veld (de dueDate van
// die open actie) — er is geen aparte, afwijkende "logisch moment"-waarde in
// de onderliggende data, dus geen tweede datum verzinnen.
//
// Handmatig aangemaakte sales-acties (geen sourceProposal) hebben geen basis
// om "wie is aan zet" te bepalen en tellen daarom terecht niet mee — geen
// gok zonder brontekst, zelfde filosofie als de rest van lib/sales/*.
export interface WachtenOpItem {
  schoolId: number;
  schoolName: string;
  relatiestatus: string | null;
  plaats: string | null;
  /** Een concrete toezegging van de school indien bekend, anders de laatste-contact-samenvatting — nooit verzonnen. */
  waaropWachten: string;
  /** Laatste betrouwbare contactdatum uit de analyse — null wanneer onbekend. */
  sindsWanneer: string | null;
  /** dueDate van de open, gekoppelde sales-actie — tevens "wanneer opvolgen logisch wordt" (zie toelichting hierboven). */
  vervolgdatum: string;
  actionId: number;
}

interface RelatieAnalyseSnapshot {
  wieIsAanZet?: "school" | "michel" | "onduidelijk";
  laatsteContactSamenvatting?: string;
  laatsteEchteContactDatum?: string | null;
  afspraken?: { tekst: string; wie: "school" | "michel" | "onduidelijk" }[];
}

interface SchoolRefMetActief {
  id: number;
  schoolName: string;
  relatiestatus?: string | null;
  plaats?: string | null;
  actief?: boolean;
}

interface SalesActionMetVoorstel {
  id: number;
  dueDate: string;
  school: number | SchoolRefMetActief;
  sourceProposal?: number | { id: number; relatieAnalyse?: RelatieAnalyseSnapshot | null } | null;
}

export async function bepaalWachtenOp(payload: Payload): Promise<WachtenOpItem[]> {
  const resultaat = await payload.find({
    collection: "sales-actions",
    where: { status: { equals: "open" } },
    depth: 1,
    limit: 500,
    overrideAccess: true,
  });

  const items: WachtenOpItem[] = [];
  for (const actie of resultaat.docs as unknown as SalesActionMetVoorstel[]) {
    if (typeof actie.school === "number" || actie.school.actief === false) continue;
    if (typeof actie.sourceProposal !== "object" || !actie.sourceProposal) continue;

    const analyse = actie.sourceProposal.relatieAnalyse;
    if (!analyse || analyse.wieIsAanZet !== "school") continue;

    const afspraakVanSchool = analyse.afspraken?.find((a) => a.wie === "school");
    const waaropWachten = afspraakVanSchool?.tekst || analyse.laatsteContactSamenvatting || "Reactie van de school";

    items.push({
      schoolId: actie.school.id,
      schoolName: actie.school.schoolName,
      relatiestatus: actie.school.relatiestatus ?? null,
      plaats: actie.school.plaats ?? null,
      waaropWachten,
      sindsWanneer: analyse.laatsteEchteContactDatum ?? null,
      vervolgdatum: actie.dueDate.slice(0, 10),
      actionId: actie.id,
    });
  }

  // Langst-wachtende eerst — ontbrekende sindsWanneer altijd achteraan, geen
  // aanname over urgentie zonder datum.
  return items.sort((a, b) => {
    if (a.sindsWanneer === null) return 1;
    if (b.sindsWanneer === null) return -1;
    return a.sindsWanneer < b.sindsWanneer ? -1 : a.sindsWanneer > b.sindsWanneer ? 1 : 0;
  });
}
