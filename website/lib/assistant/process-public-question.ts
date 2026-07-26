import type { Payload } from "payload";
import { searchKnowledgePhased } from "@/lib/embeddings/similarity-search";
import { buildContext, type ContextItem } from "./build-context";
import { genereerAssistentAntwoord, MIN_SIMILARITY_VOOR_ANTWOORD } from "./answer";
import { rewriteSearchQuery } from "./rewrite-query";

// Publieke, anonieme tegenhanger van process-question.ts — Helpdesk MVP 1.0.
// process-question.ts (het interne /assistant-scherm) blijft VOLLEDIG
// ongewijzigd: dit bestand doorloopt bewust dezelfde pijplijnstappen
// opnieuw (rewrite → gefaseerde retrieval → context → antwoord), net zoals
// lib/assistant/evaluate.ts dat al eerder deed voor de evaluatieomgeving —
// hetzelfde, inmiddels vaker toegepaste patroon in deze codebase om een
// tweede consument van de pijplijn te bedienen zonder de bestaande, geteste
// interne route te laten meebewegen met eisen die alleen voor publiek
// gebruik gelden (geen confidence/reasoning naar de eindgebruiker, geen
// verplichte ingelogde gebruiker, publiek-veilige bronvermelding i.p.v.
// admin-links).
//
// Verschil met process-question.ts:
// 1. Geen userId vereist — assistant-conversations.user is optioneel.
// 2. `manuals`: een publiek-veilige, gededupliceerde lijst van GEciteerde
//    handleidingen (title + downloadUrl-KOPPELING, geen admin-link, geen
//    similarity-percentage) — uitsluitend bronnen die een beheerder
//    expliciet op `zichtbaar: true` heeft gezet (zie KnowledgeSources.ts).
//    Dit is een weergavefilter: de retrieval/prompting hierboven gebruikt
//    ALTIJD alle geïndexeerde bronnen, ongeacht zichtbaarheid — alleen wat
//    aan de bezoeker getoond wordt, is beperkt.

const TOP_N = 10;

export interface PublicManual {
  id: number;
  title: string;
  hasFile: boolean;
}

export type ProcessPublicQuestionUitkomst =
  | {
      type: "answered" | "no-answer";
      conversationId: number;
      // Los van `type` op de JSON-respons meegegeven: HelpdeskChat.tsx (het
      // enige frontend-component dat deze respons rechtstreeks leest) toont
      // hierop het automatische contactformulier bij "geen antwoord" — een
      // expliciet boolean veld is daar duidelijker dan `type === "answered"`
      // opnieuw te moeten afleiden aan de clientkant.
      hasAnswer: boolean;
      answer: string;
      manuals: PublicManual[];
    }
  | { type: "failed"; foutmelding: string };

interface ZichtbareBron {
  id: number;
  title: string;
  zichtbaar: boolean | null | undefined;
  file: unknown;
}

/** Haalt, gededupliceerd, de zichtbare Knowledge Sources op waarnaar de geciteerde ContextItems verwijzen. */
async function bepaalPubliekeManuals(payload: Payload, contextItems: ContextItem[]): Promise<PublicManual[]> {
  const bronIds = [
    ...new Set(
      contextItems
        .filter((item) => item.type === "knowledge-source" || item.type === "knowledge-source-chapter")
        .map((item) => item.refId)
    ),
  ];
  if (bronIds.length === 0) return [];

  const bronnen = await payload.find({
    collection: "knowledge-sources",
    where: { id: { in: bronIds } },
    limit: bronIds.length,
    overrideAccess: true,
    depth: 0,
  });

  // Volgorde behouden zoals geciteerd (meest relevante eerst) — niet de
  // volgorde waarin payload.find() ze toevallig teruggeeft.
  const byId = new Map((bronnen.docs as ZichtbareBron[]).map((b) => [b.id, b]));
  const gezien = new Set<number>();
  const manuals: PublicManual[] = [];
  for (const id of bronIds) {
    if (gezien.has(id)) continue;
    gezien.add(id);
    const bron = byId.get(id);
    if (!bron || !bron.zichtbaar) continue;
    manuals.push({ id: bron.id, title: bron.title, hasFile: Boolean(bron.file) });
  }
  return manuals;
}

export async function processPublicQuestion(
  payload: Payload,
  opties: { question: string }
): Promise<ProcessPublicQuestionUitkomst> {
  const begin = Date.now();
  const zoekvraag = await rewriteSearchQuery(opties.question);

  let resultaat: Awaited<ReturnType<typeof searchKnowledgePhased>>;
  let contextItems: ContextItem[];
  try {
    resultaat = await searchKnowledgePhased(payload, {
      query: zoekvraag,
      limiet: TOP_N,
      drempelVoorVoldoende: MIN_SIMILARITY_VOOR_ANTWOORD,
    });
    contextItems = await buildContext(payload, resultaat.hits);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    return { type: "failed", foutmelding: boodschap };
  }

  const uitkomst = await genereerAssistentAntwoord(opties.question, contextItems);
  if (uitkomst.type === "failed") {
    return uitkomst;
  }

  const manuals = uitkomst.type === "answered" ? await bepaalPubliekeManuals(payload, contextItems) : [];

  const record = await payload.create({
    collection: "assistant-conversations",
    overrideAccess: true,
    data: {
      source: "helpdesk",
      question: opties.question,
      hasAnswer: uitkomst.type === "answered",
      answer: uitkomst.answer,
      reasoning: uitkomst.reasoning,
      confidence: uitkomst.confidence,
      sources: contextItems.map((item) => ({
        label: item.label,
        refCollection: item.refCollection,
        refId: item.refId,
        title: item.title,
        chapterTitle: item.chapterTitle,
        similarity: item.similarity,
        url: item.url,
      })),
      model: uitkomst.model,
      inputTokens: uitkomst.usage.inputTokens,
      outputTokens: uitkomst.usage.outputTokens,
      totalTokens: uitkomst.usage.totalTokens,
      answerTimeMs: Date.now() - begin,
      feedbackRating: "geen",
      user: null,
    },
  });

  return {
    type: uitkomst.type,
    conversationId: record.id,
    hasAnswer: uitkomst.type === "answered",
    answer: uitkomst.answer,
    manuals,
  };
}
