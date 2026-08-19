import type { Payload } from "payload";
import { generateChatText } from "@/services/ai-client";
import type { AuthTrainer } from "./auth";
import {
  bouwTrainerSchoolContext,
  bouwTrainerSchoolPrompt,
  bouwTrainerAlgemeneContext,
  bouwTrainerAlgemeenPrompt,
} from "./ai-context";

// Traineromgeving V1, Ronde 2 afronding — Trainer-AI (2026-08-19) —
// orchestreert de trainer-Vraag-chat (dashboard "Alle scholen"/specifieke
// school + schooldetail "Vraag over deze school"). Read-only bij
// constructie: dit bestand importeert nergens een schrijffunctie
// (lib/trainers/writeback.ts) — er bestaat dus geen enkel code-pad waarop
// een AI-vraag een Monday-mutatie kan veroorzaken (opdrachtseis "geen writes
// via AI in deze ronde").
//
// De routering zelf (schoolId aanwezig-en-van-deze-trainer -> schoolcontext,
// anders -> algemene/dashboard-context) is een gewone, deterministische
// TypeScript-tak — zie lib/trainers/ai-context.ts se toelichting voor waarom
// dat hier bewust GEEN LLM-classificatiestap is (in tegenstelling tot
// lib/werk/context-router.ts): de schoolkeuze komt altijd uit een expliciete
// UI-selectie, nooit uit vrije tekst.
export type TrainerVraagUitkomst =
  | { soort: "antwoord"; antwoord: string; context: "school" | "algemeen" }
  | { soort: "school_niet_gevonden" };

interface AuditMeta {
  contextSoort: "school" | "algemeen";
  mondaySchoolId: string | null;
  schoolNaam: string | null;
}

/**
 * Best-effort: een mislukte auditlogging mag de daadwerkelijke AI-vraag
 * nooit blokkeren of doen falen — zelfde soort niet-blokkerende
 * loggingshouding als elders in dit project (bv. lib/sales/sync.ts se
 * niet-kritieke logregels). Slaat bewust nooit de vraag/het antwoord zelf op
 * (opdrachtseis "zonder volledige gevoelige context onnodig op te slaan") —
 * uitsluitend een lengte- en uitkomstsignaal.
 */
async function logAiVraag(payload: Payload, trainer: AuthTrainer, meta: AuditMeta, uitkomst: "beantwoord" | "mislukt", vraagLengte: number): Promise<void> {
  try {
    await payload.create({
      collection: "trainer-ai-log-events",
      data: {
        trainer: trainer.id,
        occurredAt: new Date().toISOString(),
        contextSoort: meta.contextSoort,
        mondaySchoolId: meta.mondaySchoolId,
        schoolNaam: meta.schoolNaam,
        uitkomst,
        vraagLengte,
      },
      overrideAccess: true,
    });
  } catch (error) {
    console.error("[trainer-chat] audit-log mislukt (AI-antwoord zelf niet beïnvloed):", error);
  }
}

async function stelVraagMetContext(
  payload: Payload,
  trainer: AuthTrainer,
  vraag: string,
  systemPrompt: string,
  contextBericht: string,
  meta: AuditMeta
): Promise<string> {
  try {
    const antwoord = await generateChatText({
      systemPrompt,
      messages: [{ role: "user", content: `${contextBericht}\n\n---\n\nVraag van de trainer:\n${vraag}` }],
    });
    await logAiVraag(payload, trainer, meta, "beantwoord", vraag.length);
    return antwoord;
  } catch (error) {
    await logAiVraag(payload, trainer, meta, "mislukt", vraag.length);
    throw error;
  }
}

/**
 * `schoolId === null` betekent "Alle scholen" (dashboard-brede, begrensde
 * context) — een niet-null schoolId wordt ALTIJD server-side herverifieerd
 * via bouwTrainerSchoolContext (die op zijn beurt haalSchoolDetail
 * hergebruikt) vóórdat er enige context wordt opgebouwd: een schoolId dat
 * niet bij deze trainer hoort levert nooit context op, ongeacht wat de
 * client aanlevert.
 */
export async function stelTrainerVraag(payload: Payload, trainer: AuthTrainer, vraag: string, schoolId: string | null): Promise<TrainerVraagUitkomst> {
  if (schoolId !== null) {
    const context = await bouwTrainerSchoolContext(trainer, schoolId);
    if (!context) return { soort: "school_niet_gevonden" };

    const { systemPrompt, contextBericht } = bouwTrainerSchoolPrompt(context);
    const antwoord = await stelVraagMetContext(payload, trainer, vraag, systemPrompt, contextBericht, {
      contextSoort: "school",
      mondaySchoolId: schoolId,
      schoolNaam: context.school.naam,
    });
    return { soort: "antwoord", antwoord, context: "school" };
  }

  const context = await bouwTrainerAlgemeneContext(trainer);
  const { systemPrompt, contextBericht } = bouwTrainerAlgemeenPrompt(context);
  const antwoord = await stelVraagMetContext(payload, trainer, vraag, systemPrompt, contextBericht, {
    contextSoort: "algemeen",
    mondaySchoolId: null,
    schoolNaam: null,
  });
  return { soort: "antwoord", antwoord, context: "algemeen" };
}
