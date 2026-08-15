import type { Payload } from "payload";
import { maakSchoolRelatieAnalyse, bouwVoorstelRedenTekst } from "./relationship-analysis";
import { vervangVoorstel } from "./proposals";

// Relatie-analyse V1.1 (2026-08-15) — "Opnieuw analyseren": draait de
// bestaande SchoolRelatieAnalyse (lib/sales/relationship-analysis.ts)
// opnieuw op de ACTUELE data. Alleen zinvol voor voorstellen over de
// volgende actie (niet "veld_correctie" — dat heeft z'n eigen, aparte
// herkenningsmechanisme, lib/sales/enrichment.ts se "Onderwijstype
// herkennen"). Het oude voorstel wordt nooit overschreven: alleen bij een
// daadwerkelijk nieuw, verantwoord advies (analyse-status "klaar") ontstaat
// via vervangVoorstel() een nieuw pending voorstel en wordt het oude
// "superseded" — bij "onvoldoende_context"/"mogelijk_afgesloten" blijft het
// oude voorstel gewoon staan (nooit 0 pending voorstellen overhouden zonder
// vervanging).
export type HeranalyseUitkomst = { status: "nieuw_voorstel"; proposalId: number } | { status: "geen_wijziging"; reden: string };

interface SchoolRecord {
  id: number;
  schoolName: string;
  mondayItemId: string;
  relatiestatus?: string | null;
  salesfase?: string | null;
  onderwijstype?: number | { id: number } | null;
}

interface ProposalRecord {
  id: number;
  status: string;
  proposalType: string;
  school: number | SchoolRecord;
}

export async function heranalyseerVoorstel(payload: Payload, oudProposalId: number, actorId: number): Promise<HeranalyseUitkomst> {
  const oud = (await payload
    .findByID({ collection: "sales-proposals", id: oudProposalId, overrideAccess: true, depth: 1 })
    .catch(() => null)) as unknown as ProposalRecord | null;
  if (!oud) throw new Error("Voorstel niet gevonden.");
  if (oud.status !== "pending" && oud.status !== "conflict") {
    throw new Error("Dit voorstel is al afgehandeld — opnieuw analyseren kan niet meer.");
  }
  if (oud.proposalType !== "volgende_actie" && oud.proposalType !== "bestaande_vervolgdatum") {
    throw new Error("Opnieuw analyseren is alleen beschikbaar voor voorstellen over de volgende actie.");
  }

  const school: SchoolRecord =
    typeof oud.school === "number"
      ? ((await payload.findByID({ collection: "sales-schools", id: oud.school, overrideAccess: true, depth: 0 })) as unknown as SchoolRecord)
      : oud.school;

  const uitkomst = await maakSchoolRelatieAnalyse(payload, {
    id: school.id,
    schoolName: school.schoolName,
    mondayItemId: school.mondayItemId,
    relatiestatus: school.relatiestatus,
    salesfase: school.salesfase,
    onderwijstype: school.onderwijstype,
    mondayVolgendeActieDatum: null, // een 'bestaande_vervolgdatum'-voorstel opnieuw analyseren beoordeelt de RELATIE opnieuw, niet die specifieke Monday-datum
  });

  if (uitkomst.status === "mogelijk_afgesloten") {
    return { status: "geen_wijziging", reden: "De relatie lijkt inmiddels mogelijk afgesloten — beoordeel handmatig, het oude voorstel blijft staan." };
  }
  if (uitkomst.status !== "klaar") {
    return { status: "geen_wijziging", reden: "Onvoldoende nieuwe, betrouwbare context voor een bijgewerkt voorstel — het oude voorstel blijft staan." };
  }

  const { analyse, brontekstUpdateIds } = uitkomst;
  const { nieuwProposalId } = await vervangVoorstel(payload, {
    oudProposalId,
    nieuwVoorstel: {
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
    },
    actorId,
    logSamenvatting: `Voorstel opnieuw geanalyseerd: ${analyse.aanbevolenVolgendeStap}`,
  });

  return { status: "nieuw_voorstel", proposalId: nieuwProposalId };
}
