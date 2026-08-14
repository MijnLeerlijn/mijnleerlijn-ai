import { z } from "zod";
import type { Payload } from "payload";
import { generateStructuredOutput } from "@/services/ai-client";
import { haalUpdatesVoorItem, leesKolomWaarde } from "./monday-client";
import { SCHOLEN_KOLOM, TYPE_SCHOOL_WAARDEN, isGemigreerdeUpdate } from "./monday-columns";

// Sales-assistent V1 (2026-08-14) — verrijkingslaag. Bevestigd scoped op
// uitsluitend "Type school": andere kandidaten (Binnengekomen via, Aantal
// leerlingen, Datum eerste contact) zijn in de sessie-analyse benoemd maar
// bewust NIET geactiveerd. Relatiestatus/Salesfase/Verantwoordelijke zijn
// expliciet uitgesloten, ook als toekomstig kandidaat (subjectieve/
// organisatorische keuzes, geen uit tekst afleidbare feiten).
//
// `z.enum(TYPE_SCHOOL_WAARDEN)` is een STRUCTURELE garantie, geen
// promptinstructie-belofte: de Vercel AI SDK dwingt het model naar exact dit
// schema af — een 4e waarde (bv. "Dalton") is voor het model letterlijk geen
// geldige output, geen kwestie van "hopen dat het zich aan de instructie
// houdt".
//
// Confidence "laag" wordt HIER nog wel opgeslagen (audit-volledigheid) —
// het weren uit de UI gebeurt bij het OPHALEN (zie app/api/sales/proposals),
// niet door het voorstel niet aan te maken.
const TypeSchoolVoorstelSchema = z.object({
  waarde: z.enum(TYPE_SCHOOL_WAARDEN).nullable(),
  basis: z.string(),
  confidence: z.enum(["hoog", "middel", "laag"]),
});

const SYSTEEMPROMPT = `Je herkent het onderwijstype van een school uit contactverslagen — ALLEEN als dat expliciet en ondubbelzinnig uit de tekst blijkt.

De ENIGE toegestane waarden zijn: ${TYPE_SCHOOL_WAARDEN.join(", ")}. Geef nooit een andere waarde, ook niet als de tekst een ander onderwijstype noemt (bijv. Dalton of Jenaplan) — geef in dat geval waarde: null.

Als het onderwijstype niet duidelijk uit de tekst blijkt: waarde: null, confidence: "laag".

"basis" moet concreet verwijzen naar wat er in de tekst staat — verzin niets, citeer of vat nauwkeurig samen.`;

export interface TypeSchoolVoorstelResultaat {
  aangemaakt: boolean;
  reden?: string;
}

export async function genereerTypeSchoolVoorstel(payload: Payload, schoolId: number): Promise<TypeSchoolVoorstelResultaat> {
  const school = await payload.findByID({ collection: "sales-schools", id: schoolId, overrideAccess: true, depth: 0 });
  if (!school) return { aangemaakt: false, reden: "School niet gevonden." };
  if (school.onderwijstype) return { aangemaakt: false, reden: "Onderwijstype is al gezet — geen verrijking nodig." };

  const bestaandVoorstel = await payload.find({
    collection: "sales-proposals",
    where: {
      school: { equals: schoolId },
      proposalType: { equals: "veld_correctie" },
      targetColumnId: { equals: SCHOLEN_KOLOM.typeSchool },
      status: { equals: "pending" },
    },
    limit: 1,
    overrideAccess: true,
    depth: 0,
  });
  if (bestaandVoorstel.docs.length > 0) {
    return { aangemaakt: false, reden: "Er staat al een openstaand veldvoorstel voor Type school." };
  }

  const mondayItemId = (school as unknown as { mondayItemId: string }).mondayItemId;
  const updates = await haalUpdatesVoorItem(mondayItemId);
  const betrouwbareUpdates = updates.filter((u) => !isGemigreerdeUpdate(u.text_body));
  if (betrouwbareUpdates.length === 0) {
    return { aangemaakt: false, reden: "Geen betrouwbare (niet-gemigreerde) Updates gevonden om op te baseren." };
  }

  const brontekst = betrouwbareUpdates.map((u) => `[Update ${u.id}, ${u.created_at}]\n${u.text_body}`).join("\n\n---\n\n");

  const voorstel = await generateStructuredOutput({
    schema: TypeSchoolVoorstelSchema,
    systemPrompt: SYSTEEMPROMPT,
    userPrompt: brontekst,
  });

  if (!voorstel.waarde) {
    return { aangemaakt: false, reden: "AI kon geen betrouwbare waarde herkennen." };
  }

  const huidigeMondayWaarde = await leesKolomWaarde(mondayItemId, SCHOLEN_KOLOM.typeSchool);

  const nieuwVoorstel = await payload.create({
    collection: "sales-proposals",
    data: {
      school: schoolId,
      proposalType: "veld_correctie",
      proposalText: `Onderwijstype lijkt "${voorstel.waarde}" te zijn.`,
      reason: voorstel.basis,
      targetColumnId: SCHOLEN_KOLOM.typeSchool,
      proposedValue: voorstel.waarde,
      mondayValueAtProposalTime: huidigeMondayWaarde?.text ?? null,
      sourceUpdateIds: betrouwbareUpdates.map((u) => ({ updateId: u.id })),
      confidence: voorstel.confidence,
      status: "pending",
    },
    overrideAccess: true,
  });

  await payload.create({
    collection: "sales-log-events",
    data: {
      school: schoolId,
      occurredAt: new Date().toISOString(),
      type: "ai_voorstel",
      source: "sales-ai",
      summary: `AI-veldvoorstel: Type school "${voorstel.waarde}" (${voorstel.confidence})`,
      relatedProposal: nieuwVoorstel.id,
    },
    overrideAccess: true,
  });

  return { aangemaakt: true };
}
