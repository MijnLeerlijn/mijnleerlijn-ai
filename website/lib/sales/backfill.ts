import type { Payload } from "payload";
import { maakSchoolRelatieAnalyse, bouwVoorstelRedenTekst } from "./relationship-analysis";
import { vindActieveScholenZonderVervolgactie } from "./aandacht-nodig";

// Sales-assistent V1 (2026-08-14) — initiële analyse/backfill. "Openstaand"
// wordt NIET hier opnieuw bepaald maar rechtstreeks gelezen uit
// sales-schools.actief (al gezet tijdens sync op basis van de live bevestigde
// Relatiestatus-waarden — zie lib/sales/sync.ts). Draait pas ná een werkende
// sync, en maakt NOOIT een geaccepteerde actie aan — uitsluitend
// sales-proposals met status "pending". Idempotent: een school met al een
// open actie of al een pending voorstel wordt overgeslagen (geen dubbele
// voorstellen bij een herhaalde run).
//
// Relatie-analyse V1 (2026-08-15) — de daadwerkelijke AI-redenering
// (structured output, harde regels rond expliciete afspraken/gemigreerde
// geschiedenis/onvoldoende context) zit voortaan in
// lib/sales/relationship-analysis.ts — dit bestand blijft verantwoordelijk
// voor de idempotentie-/veiligheidsgates hieronder (ongewijzigd), niet voor
// de inhoudelijke AI-logica zelf.
const MAX_VOORBEELD_SCHOLEN_PER_RUN = 500; // veiligheidslimiet, geen aanname over datasetgrootte

export type BackfillUitkomst =
  | "vervolgactie_bestaat"
  | "ai_voorstel_klaar"
  | "onvoldoende_context"
  | "mogelijk_afgesloten"
  | "bestaande_planning_bevestigd";

export interface BackfillSchoolResultaat {
  schoolId: number;
  schoolName: string;
  uitkomst: BackfillUitkomst;
  proposalId?: number;
}

export interface BackfillResultaat {
  scholenBeoordeeld: number;
  perUitkomst: Record<BackfillUitkomst, number>;
  resultaten: BackfillSchoolResultaat[];
  fouten: string[];
}

async function bestaatOpenActie(payload: Payload, schoolId: number): Promise<boolean> {
  const result = await payload.find({
    collection: "sales-actions",
    where: { school: { equals: schoolId }, status: { equals: "open" } },
    limit: 1,
    overrideAccess: true,
    depth: 0,
  });
  return result.docs.length > 0;
}

async function bestaandPendingVoorstel(payload: Payload, schoolId: number, proposalType: string): Promise<number | undefined> {
  const result = await payload.find({
    collection: "sales-proposals",
    where: { school: { equals: schoolId }, proposalType: { equals: proposalType }, status: { equals: "pending" } },
    limit: 1,
    overrideAccess: true,
    depth: 0,
  });
  return result.docs[0]?.id as number | undefined;
}

async function heeftBetrouwbareLokaleContactcontext(payload: Payload, schoolId: number): Promise<boolean> {
  const result = await payload.find({
    collection: "sales-log-events",
    where: { school: { equals: schoolId }, type: { equals: "contact" } },
    sort: "-occurredAt",
    limit: 10,
    overrideAccess: true,
    depth: 0,
  });
  return result.docs.some((doc) => {
    const payloadVeld = (doc as { payload?: { gemigreerd?: boolean } }).payload;
    return !payloadVeld?.gemigreerd;
  });
}

async function genereerVolgendeActieVoorstel(
  payload: Payload,
  school: {
    id: number;
    schoolName: string;
    mondayItemId: string;
    mondayVolgendeActieDatum?: string | null;
    relatiestatus?: string | null;
    salesfase?: string | null;
    onderwijstype?: number | { id: number } | null;
  }
): Promise<BackfillSchoolResultaat> {
  const uitkomst = await maakSchoolRelatieAnalyse(payload, {
    id: school.id,
    schoolName: school.schoolName,
    mondayItemId: school.mondayItemId,
    relatiestatus: school.relatiestatus,
    salesfase: school.salesfase,
    onderwijstype: school.onderwijstype,
    mondayVolgendeActieDatum: school.mondayVolgendeActieDatum ?? null,
  });

  if (uitkomst.status === "geen_context" || uitkomst.status === "onvoldoende_context") {
    return { schoolId: school.id, schoolName: school.schoolName, uitkomst: "onvoldoende_context" };
  }
  if (uitkomst.status === "mogelijk_afgesloten") {
    return { schoolId: school.id, schoolName: school.schoolName, uitkomst: "mogelijk_afgesloten" };
  }

  const { analyse, brontekstUpdateIds } = uitkomst;

  // Sales-logica productiecorrectie 2026-08-16 (punt 3/5) — productievoorbeeld
  // "Springplank": Monday heeft al Datum volgende actie = 24 augustus, en de
  // analyse (lib/sales/relationship-analysis.ts) respecteert die datum
  // (datumHerkomst "bestaande_monday_datum" — regel 2 van de hiërarchie, GEEN
  // nieuwere expliciete afspraak in de logs die 'm zou overschrijven). Een
  // school waarvoor Monday al een geldige planning heeft die simpelweg
  // gerespecteerd wordt, hoeft GEEN nieuw pending voorstel — dat zou een
  // beslissing suggereren die er niet is (Monday's datum staat al vast).
  // Alleen bij "nieuwe_afspraak_uit_logs" (een aantoonbaar nieuwere,
  // expliciete afspraak overschrijft Monday's datum) of
  // "generieke_inschatting" (geen bestaande Monday-datum om te respecteren)
  // ontstaat hieronder nog een echt voorstel.
  if (analyse.datumHerkomst === "bestaande_monday_datum") {
    return { schoolId: school.id, schoolName: school.schoolName, uitkomst: "bestaande_planning_bevestigd" };
  }

  const nieuwVoorstel = await payload.create({
    collection: "sales-proposals",
    data: {
      school: school.id,
      proposalType: "volgende_actie",
      proposalText: analyse.aanbevolenVolgendeStap ?? "Vervolgstap voorstellen.",
      reason: bouwVoorstelRedenTekst(analyse),
      proposedDate: analyse.aanbevolenDatum,
      proposedType: analyse.aanbevolenType,
      proposedChannel: analyse.aanbevolenKanaal,
      sourceUpdateIds: brontekstUpdateIds.map((id) => ({ updateId: id })),
      relatieAnalyse: analyse as unknown as Record<string, unknown>,
      confidence: analyse.confidence,
      status: "pending",
    },
    overrideAccess: true,
  });

  await payload.create({
    collection: "sales-log-events",
    data: {
      school: school.id,
      occurredAt: new Date().toISOString(),
      type: "ai_voorstel",
      source: "sales-ai",
      summary: `AI-voorstel vervolgactie: ${analyse.aanbevolenVolgendeStap ?? "(geen beschrijving)"}`,
      relatedProposal: nieuwVoorstel.id,
    },
    overrideAccess: true,
  });

  return { schoolId: school.id, schoolName: school.schoolName, uitkomst: "ai_voorstel_klaar", proposalId: nieuwVoorstel.id as number };
}

/**
 * Sales UX V2 (2026-08-14) — geëxporteerd (was module-privé) zodat
 * lib/sales/sync.ts dezelfde beoordeling per-school kan hergebruiken voor de
 * proactieve her-evaluatie na nieuwe, echte Monday-activiteit — geen tweede
 * implementatie van dezelfde idempotentie-/veiligheidsregels.
 */
export async function beoordeelSchool(
  payload: Payload,
  school: {
    id: number;
    schoolName: string;
    mondayItemId: string;
    mondayVolgendeActieDatum?: string | null;
    relatiestatus?: string | null;
    salesfase?: string | null;
    onderwijstype?: number | { id: number } | null;
  }
): Promise<BackfillSchoolResultaat> {
  if (await bestaatOpenActie(payload, school.id)) {
    return { schoolId: school.id, schoolName: school.schoolName, uitkomst: "vervolgactie_bestaat" };
  }

  const bestaandVolgendeActieVoorstel = await bestaandPendingVoorstel(payload, school.id, "volgende_actie");
  if (bestaandVolgendeActieVoorstel) {
    return { schoolId: school.id, schoolName: school.schoolName, uitkomst: "ai_voorstel_klaar", proposalId: bestaandVolgendeActieVoorstel };
  }
  // "bestaande_vervolgdatum" is een uitgefaseerd voorsteltype (Sales-logica
  // productiecorrectie 2026-08-16, punt 6/7/11): een Monday-vervolgdatum is
  // voortaan harde context vóór de AI-analyse (zie genereerVolgendeActieVoorstel
  // hieronder), niet langer een kortsluiting die de analyse overslaat. Deze
  // check blijft puur voor idempotentie — een school met nog een oud, niet
  // afgehandeld voorstel van dit type uit een eerdere run krijgt geen tweede.
  const bestaandeVervolgdatumVoorstel = await bestaandPendingVoorstel(payload, school.id, "bestaande_vervolgdatum");
  if (bestaandeVervolgdatumVoorstel) {
    return { schoolId: school.id, schoolName: school.schoolName, uitkomst: "ai_voorstel_klaar", proposalId: bestaandeVervolgdatumVoorstel };
  }

  if (!(await heeftBetrouwbareLokaleContactcontext(payload, school.id))) {
    return { schoolId: school.id, schoolName: school.schoolName, uitkomst: "onvoldoende_context" };
  }

  return genereerVolgendeActieVoorstel(payload, school);
}

export async function voerBackfillUit(payload: Payload): Promise<BackfillResultaat> {
  const scholen = await payload.find({
    collection: "sales-schools",
    where: { actief: { equals: true } },
    limit: MAX_VOORBEELD_SCHOLEN_PER_RUN,
    overrideAccess: true,
    depth: 0,
  });

  const resultaat: BackfillResultaat = {
    scholenBeoordeeld: 0,
    perUitkomst: { vervolgactie_bestaat: 0, ai_voorstel_klaar: 0, onvoldoende_context: 0, mogelijk_afgesloten: 0, bestaande_planning_bevestigd: 0 },
    resultaten: [],
    fouten: [],
  };

  for (const doc of scholen.docs) {
    const school = doc as unknown as {
      id: number;
      schoolName: string;
      mondayItemId: string;
      mondayVolgendeActieDatum?: string | null;
      relatiestatus?: string | null;
      salesfase?: string | null;
      onderwijstype?: number | { id: number } | null;
    };
    try {
      const uitkomst = await beoordeelSchool(payload, school);
      resultaat.resultaten.push(uitkomst);
      resultaat.perUitkomst[uitkomst.uitkomst]++;
      resultaat.scholenBeoordeeld++;
    } catch (error) {
      resultaat.fouten.push(`School ${school.id} (${school.schoolName}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return resultaat;
}

/**
 * Sales UX V2 (2026-08-14) — vooraf-telling voor de backfill-knop ("Laat AI
 * vervolgacties voorstellen voor N scholen"). Puur informatief: hergebruikt
 * dezelfde "Aandacht nodig"-set als de dashboardwidget/Vandaag, telt dus
 * niet 1-op-1 hoeveel scholen straks daadwerkelijk een voorstel krijgen (een
 * deel valt af als "onvoldoende_context") — bewust dezelfde, voor de
 * gebruiker herkenbare definitie i.p.v. een tweede, subtiel andere telling.
 */
export async function telScholenVoorBackfill(payload: Payload): Promise<number> {
  const scholen = await vindActieveScholenZonderVervolgactie(payload);
  return scholen.length;
}
