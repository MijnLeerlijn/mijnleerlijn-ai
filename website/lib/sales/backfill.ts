import { z } from "zod";
import type { Payload } from "payload";
import { generateStructuredOutput } from "@/services/ai-client";
import { haalUpdatesVoorItem } from "./monday-client";
import { isGemigreerdeUpdate } from "./monday-columns";
import { vindActieveScholenZonderVervolgactie } from "./aandacht-nodig";

// Sales-assistent V1 (2026-08-14) — initiële analyse/backfill. "Openstaand"
// wordt NIET hier opnieuw bepaald maar rechtstreeks gelezen uit
// sales-schools.actief (al gezet tijdens sync op basis van de live bevestigde
// Relatiestatus-waarden — zie lib/sales/sync.ts). Draait pas ná een werkende
// sync, en maakt NOOIT een geaccepteerde actie aan — uitsluitend
// sales-proposals met status "pending". Idempotent: een school met al een
// open actie of al een pending voorstel wordt overgeslagen (geen dubbele
// voorstellen bij een herhaalde run).
const MAX_VOORBEELD_SCHOLEN_PER_RUN = 500; // veiligheidslimiet, geen aanname over datasetgrootte

export type BackfillUitkomst =
  | "vervolgactie_bestaat"
  | "ai_voorstel_klaar"
  | "onvoldoende_context"
  | "mogelijk_afgesloten";

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

const VolgendeActieVoorstelSchema = z.object({
  uitkomst: z.enum(["voorstel", "mogelijk_afgesloten"]),
  voorgesteldeActie: z.string().nullable(),
  voorgesteldeDatum: z.string().nullable(),
  voorgesteldType: z.enum(["mail", "bellen", "afspraak", "voorbereiding", "informatie_sturen", "anders"]).nullable(),
  voorgesteldKanaal: z.enum(["mail", "telefoon", "in_persoon", "anders"]).nullable(),
  reden: z.string(),
});

const SYSTEEMPROMPT = `Je bent de MijnLeerlijn Sales-assistent. Je krijgt recente, betrouwbare contactverslagen van één school en stelt een concrete vervolgstap voor — of concludeert dat de school inhoudelijk waarschijnlijk is afgesloten/afgewezen, ook als de status daar in Monday nog niet op is bijgewerkt.

HARDE REGEL: als een verslag een EXPLICIETE datum, toezegging of afspraak bevat (bijv. "ik bel op 4 september", "ik stuur volgende week voorbeelden"), gebruik dan DIE datum/dat tijdsbestek — verzin nooit een andere termijn als die er al expliciet staat.

Geef "uitkomst": "mogelijk_afgesloten" ALLEEN als de tekst een duidelijke afwijzing/einde van interesse bevat (bijv. "we gaan niet verder met MijnLeerlijn"). Twijfel je, kies dan "voorstel".

"reden" moet concreet naar de tekst verwijzen — verzin niets.`;

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

async function verwerkBestaandeVervolgdatum(
  payload: Payload,
  school: { id: number; schoolName: string; mondayVolgendeActieDatum?: string | null }
): Promise<BackfillSchoolResultaat> {
  const nieuwVoorstel = await payload.create({
    collection: "sales-proposals",
    data: {
      school: school.id,
      proposalType: "bestaande_vervolgdatum",
      proposalText: `Monday heeft al een vervolgdatum (${school.mondayVolgendeActieDatum}) zonder lokale Sales-actie.`,
      reason: "Datum volgende actie stond al in Monday vóórdat de Sales-assistent deze school beoordeelde.",
      proposedDate: school.mondayVolgendeActieDatum,
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
      source: "systeem",
      summary: `Bestaande vervolgdatum gevonden in Monday: ${school.mondayVolgendeActieDatum}`,
      relatedProposal: nieuwVoorstel.id,
    },
    overrideAccess: true,
  });
  return { schoolId: school.id, schoolName: school.schoolName, uitkomst: "ai_voorstel_klaar", proposalId: nieuwVoorstel.id as number };
}

async function genereerVolgendeActieVoorstel(
  payload: Payload,
  school: { id: number; schoolName: string; mondayItemId: string }
): Promise<BackfillSchoolResultaat> {
  const updates = await haalUpdatesVoorItem(school.mondayItemId);
  const betrouwbareUpdates = updates.filter((u) => !isGemigreerdeUpdate(u.text_body));
  if (betrouwbareUpdates.length === 0) {
    return { schoolId: school.id, schoolName: school.schoolName, uitkomst: "onvoldoende_context" };
  }

  const brontekst = betrouwbareUpdates
    .slice(0, 10)
    .map((u) => `[${u.created_at}]\n${u.text_body}`)
    .join("\n\n---\n\n");

  const voorstel = await generateStructuredOutput({
    schema: VolgendeActieVoorstelSchema,
    systemPrompt: SYSTEEMPROMPT,
    userPrompt: brontekst,
  });

  if (voorstel.uitkomst === "mogelijk_afgesloten") {
    return { schoolId: school.id, schoolName: school.schoolName, uitkomst: "mogelijk_afgesloten" };
  }

  const nieuwVoorstel = await payload.create({
    collection: "sales-proposals",
    data: {
      school: school.id,
      proposalType: "volgende_actie",
      proposalText: voorstel.voorgesteldeActie ?? "Vervolgstap voorstellen.",
      reason: voorstel.reden,
      proposedDate: voorstel.voorgesteldeDatum,
      proposedType: voorstel.voorgesteldType,
      proposedChannel: voorstel.voorgesteldKanaal,
      sourceUpdateIds: betrouwbareUpdates.slice(0, 10).map((u) => ({ updateId: u.id })),
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
      summary: `AI-voorstel vervolgactie: ${voorstel.voorgesteldeActie ?? "(geen beschrijving)"}`,
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
  school: { id: number; schoolName: string; mondayItemId: string; mondayVolgendeActieDatum?: string | null }
): Promise<BackfillSchoolResultaat> {
  if (await bestaatOpenActie(payload, school.id)) {
    return { schoolId: school.id, schoolName: school.schoolName, uitkomst: "vervolgactie_bestaat" };
  }

  const bestaandVolgendeActieVoorstel = await bestaandPendingVoorstel(payload, school.id, "volgende_actie");
  if (bestaandVolgendeActieVoorstel) {
    return { schoolId: school.id, schoolName: school.schoolName, uitkomst: "ai_voorstel_klaar", proposalId: bestaandVolgendeActieVoorstel };
  }
  const bestaandeVervolgdatumVoorstel = await bestaandPendingVoorstel(payload, school.id, "bestaande_vervolgdatum");
  if (bestaandeVervolgdatumVoorstel) {
    return { schoolId: school.id, schoolName: school.schoolName, uitkomst: "ai_voorstel_klaar", proposalId: bestaandeVervolgdatumVoorstel };
  }

  if (school.mondayVolgendeActieDatum) {
    return verwerkBestaandeVervolgdatum(payload, school);
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
    perUitkomst: { vervolgactie_bestaat: 0, ai_voorstel_klaar: 0, onvoldoende_context: 0, mogelijk_afgesloten: 0 },
    resultaten: [],
    fouten: [],
  };

  for (const doc of scholen.docs) {
    const school = doc as unknown as { id: number; schoolName: string; mondayItemId: string; mondayVolgendeActieDatum?: string | null };
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
