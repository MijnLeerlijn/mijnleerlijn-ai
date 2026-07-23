import type { Payload } from "payload";
import { searchKnowledge } from "@/lib/embeddings/similarity-search";
import { buildContext, type ContextItem } from "./build-context";
import { genereerAssistentAntwoord } from "./answer";

// Payload-orkestratie van één vraag: embedding + semantische zoekopdracht
// (lib/embeddings/similarity-search.ts — embedt de vraag zelf al intern),
// context opbouwen (build-context.ts), antwoord genereren (answer.ts), en
// het resultaat loggen in assistant-conversations. De Payload-tegenhanger
// van lib/knowledge/process-source.ts / lib/embeddings/process-embedding.ts.
//
// Bronnen worden alleen getoond/gelogd bij een daadwerkelijk antwoord — bij
// "geen antwoord gevonden" toont de UI geen bronnenlijst (die zou anders
// ten onrechte suggereren dat er wél bruikbare bronnen waren).

const TOP_N = 10;

export interface BronWeergave {
  label: string;
  refCollection: ContextItem["refCollection"];
  refId: number;
  title: string;
  chapterTitle?: string;
  similarity: number;
  url: string;
}

export type ProcessQuestionUitkomst =
  | {
      type: "answered" | "no-answer";
      conversationId: number;
      answer: string;
      reasoning: string;
      confidence: number;
      sources: BronWeergave[];
    }
  | { type: "failed"; foutmelding: string };

function naarBronWeergave(item: ContextItem): BronWeergave {
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

export async function processQuestion(
  payload: Payload,
  opties: { question: string; userId: number }
): Promise<ProcessQuestionUitkomst> {
  const begin = Date.now();

  // De embedding/zoekfase (searchKnowledge embedt de vraag zelf al intern)
  // kan om dezelfde reden mislukken als de antwoordfase (bv. ontbrekende
  // OPENAI_API_KEY) — hier expliciet afgevangen zodat zo'n fout hetzelfde
  // nette "failed"-pad volgt als een mislukte AI-aanroep in answer.ts, i.p.v.
  // als onverwachte fout in de route te belanden.
  let hits: Awaited<ReturnType<typeof searchKnowledge>>;
  let contextItems: ContextItem[];
  try {
    hits = await searchKnowledge(payload, { query: opties.question, limiet: TOP_N });
    contextItems = await buildContext(payload, hits);
  } catch (error) {
    const boodschap = error instanceof Error ? error.message : String(error);
    return { type: "failed", foutmelding: boodschap };
  }

  const uitkomst = await genereerAssistentAntwoord(opties.question, contextItems);
  const answerTimeMs = Date.now() - begin;

  if (uitkomst.type === "failed") {
    return uitkomst;
  }

  const bronnenVoorWeergave = uitkomst.type === "answered" ? contextItems.map(naarBronWeergave) : [];

  const record = await payload.create({
    collection: "assistant-conversations",
    overrideAccess: true,
    data: {
      question: opties.question,
      hasAnswer: uitkomst.type === "answered",
      answer: uitkomst.answer,
      reasoning: uitkomst.reasoning,
      confidence: uitkomst.confidence,
      sources: bronnenVoorWeergave.map((b) => ({
        label: b.label,
        refCollection: b.refCollection,
        refId: b.refId,
        title: b.title,
        chapterTitle: b.chapterTitle,
        similarity: b.similarity,
        url: b.url,
      })),
      model: uitkomst.model,
      inputTokens: uitkomst.usage.inputTokens,
      outputTokens: uitkomst.usage.outputTokens,
      totalTokens: uitkomst.usage.totalTokens,
      answerTimeMs,
      feedbackRating: "geen",
      user: opties.userId,
    },
  });

  return {
    type: uitkomst.type,
    conversationId: record.id,
    answer: uitkomst.answer,
    reasoning: uitkomst.reasoning,
    confidence: uitkomst.confidence,
    sources: bronnenVoorWeergave,
  };
}
