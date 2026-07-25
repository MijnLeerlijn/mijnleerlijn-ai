import type { Payload } from "payload";
import { searchKnowledgePhased } from "@/lib/embeddings/similarity-search";
import { buildContext, contextItemsNaarPrompt, type ContextItem } from "./build-context";
import { genereerAssistentAntwoord, MIN_SIMILARITY_VOOR_ANTWOORD } from "./answer";
import { rewriteSearchQuery } from "./rewrite-query";

// Chatbot-evaluatieomgeving: draait EXACT dezelfde pijplijnstappen als
// lib/assistant/process-question.ts (rewrite → gefaseerde retrieval →
// context → antwoord) — bewust GEEN eigen kopie van die logica, wél een
// aparte functie, om twee redenen:
//   1. process-question.ts schrijft naar `assistant-conversations` (ECHTE
//      gebruikersgesprekken, met een user-koppeling) — evaluatieruns horen
//      daar niet tussen, zie payload/collections/AssistantEvalRuns.ts.
//   2. Deze functie geeft VEEL méér diagnostiek terug dan een eindgebruiker
//      ooit te zien krijgt (herschreven zoekvraag, similarity/prioriteit/
//      bronrol per gevonden bron, de volledige prompt-context) — bedoeld om
//      objectief te kunnen beoordelen WAAR een antwoord misgaat, niet om
//      gebruikt te worden als de publieke assistent-respons.
//
// GEEN automatische beoordeling: deze functie bepaalt nooit zelf of een
// antwoord "correct" is — dat is uitsluitend een menselijk oordeel
// (payload/collections/AssistantEvalRuns.ts, veld `verdict`), opzettelijk
// buiten deze functie gehouden ("Voeg geen automatische optimalisatie toe").

const TOP_N = 10;

export interface EvalHit {
  type: ContextItem["type"];
  refId: number;
  title: string;
  chapterTitle?: string;
  similarity: number;
  priority?: string;
  bronrol?: string;
}

export interface EvalSource {
  label: string;
  refCollection: ContextItem["refCollection"];
  refId: number;
  title: string;
  chapterTitle?: string;
  similarity: number;
  url: string;
}

export type EvalUitkomst =
  | {
      type: "answered" | "no-answer";
      question: string;
      rewrittenQuery: string;
      retrievalFase: string;
      hits: EvalHit[];
      contextText: string;
      hasAnswer: boolean;
      answer: string;
      reasoning: string;
      confidence: number;
      sources: EvalSource[];
      model: string;
    }
  | { type: "failed"; foutmelding: string };

function naarEvalSource(item: ContextItem): EvalSource {
  return {
    label: item.label,
    refCollection: item.refCollection,
    refId: item.refId,
    title: item.title,
    chapterTitle: item.chapterTitle,
    similarity: item.similarity,
    url: item.url,
  };
}

export async function runAssistantEvaluation(payload: Payload, question: string): Promise<EvalUitkomst> {
  const rewrittenQuery = await rewriteSearchQuery(question);

  let resultaat: Awaited<ReturnType<typeof searchKnowledgePhased>>;
  let contextItems: ContextItem[];
  try {
    resultaat = await searchKnowledgePhased(payload, {
      query: rewrittenQuery,
      limiet: TOP_N,
      drempelVoorVoldoende: MIN_SIMILARITY_VOOR_ANTWOORD,
    });
    contextItems = await buildContext(payload, resultaat.hits);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    return { type: "failed", foutmelding: boodschap };
  }

  const hits: EvalHit[] = resultaat.hits.map((h) => ({
    type: h.type,
    refId: h.id,
    title: h.title,
    chapterTitle: h.chapterTitle,
    similarity: h.similarity,
    priority: h.priority,
    bronrol: h.bronrol,
  }));
  const contextText = contextItemsNaarPrompt(contextItems);

  const uitkomst = await genereerAssistentAntwoord(question, contextItems);
  if (uitkomst.type === "failed") {
    return uitkomst;
  }

  const sources = uitkomst.type === "answered" ? contextItems.map(naarEvalSource) : [];

  return {
    type: uitkomst.type,
    question,
    rewrittenQuery,
    retrievalFase: resultaat.fase,
    hits,
    contextText,
    hasAnswer: uitkomst.type === "answered",
    answer: uitkomst.answer,
    reasoning: uitkomst.reasoning,
    confidence: uitkomst.confidence,
    sources,
    model: uitkomst.model,
  };
}
