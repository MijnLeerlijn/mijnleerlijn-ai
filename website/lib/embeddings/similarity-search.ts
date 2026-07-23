import type { Payload } from "payload";
import { cosineSimilarity } from "ai";
import { generateEmbedding } from "@/services/ai-client";

// Semantische zoekfunctie over alle geëmbedde documenten (knowledge-sources
// + hun hoofdstukken, knowledge-drafts, articles) — geen chatbot, geen
// gegenereerd antwoord: uitsluitend een gerangschikte lijst treffers met
// similarity-score. Cosine similarity komt rechtstreeks uit de Vercel AI
// SDK (`cosineSimilarity`) i.p.v. zelf herimplementeren.
//
// TIJDELIJKE implementatie: laadt alle geïndexeerde vectoren in het geheugen
// en rekent in JS — werkt prima op de schaal van deze sprint, maar is
// bewust de eerste (en enige) plek die vervangen moet worden zodra er een
// echte vectorstore/pgvector-koppeling komt. Zie het commentaar bij
// `embedding` in payload/collections/KnowledgeSources.ts.

export type SearchHitType = "knowledge-source" | "knowledge-source-chapter" | "knowledge-draft" | "article";

export interface SearchHit {
  type: SearchHitType;
  id: number;
  title: string;
  chapterTitle?: string;
  similarity: number;
  reason: string;
}

const STANDAARD_ZOEKLIMIET = 10;
const MAX_KANDIDATEN_PER_COLLECTIE = 500;

// Sprint 6: veilige standaard voor welke knowledge-drafts de assistent als
// bron mag gebruiken. Overwogen opties waren "new" meetellen (nee — dat is
// onbeoordeelde, mogelijk onjuiste of nog niet op algemene bruikbaarheid
// gecontroleerde AI-output uit Gmail-analyse, zie lib/support/analyze.ts),
// "published" meetellen (ook nee — dat betekent juist dat het concept al
// handmatig is omgezet naar een echt Article; dat Article wordt zelf al
// apart geëmbed/geciteerd, dus een gepubliceerd concept ERNAAST laten
// meezoeken zou dezelfde kennis dubbel en mogelijk verouderd laten
// terugkomen), en "rejected" (vanzelfsprekend nooit). Uitkomst: uitsluitend
// "approved" — een concept dat een beheerder heeft beoordeeld en akkoord
// bevonden als algemeen bruikbare kennis, maar nog niet (of nooit) apart tot
// artikel is verwerkt. Zelfde poort afgedwongen in
// lib/embeddings/process-embedding.ts::embedKnowledgeDraft() (kan dus al
// nooit een embedding krijgen) — dit filter hier is bewuste verdediging in
// diepte, voor het geval een embedding van vóór deze wijziging nog bestaat
// of een concept na het embedden alsnog afgekeurd wordt.
const VEILIGE_DRAFT_STATUSSEN = ["approved"];

const TYPE_LABEL: Record<SearchHitType, string> = {
  "knowledge-source": "deze kennisbron",
  "knowledge-source-chapter": "dit hoofdstuk",
  "knowledge-draft": "dit conceptkennisartikel",
  article: "dit artikel",
};

function bouwReden(type: SearchHitType, similarity: number, chapterTitle?: string): string {
  const percentage = Math.round(similarity * 100);
  const kwalificatie =
    similarity >= 0.85 ? "zeer hoge" : similarity >= 0.7 ? "hoge" : similarity >= 0.5 ? "gemiddelde" : "lage";
  const doel = chapterTitle ? `hoofdstuk "${chapterTitle}"` : TYPE_LABEL[type];
  return `${kwalificatie} semantische overlap (${percentage}%) met ${doel}.`;
}

interface Kandidaat {
  type: SearchHitType;
  id: number;
  title: string;
  chapterTitle?: string;
  embedding: number[];
}

function isEmbeddingVector(waarde: unknown): waarde is number[] {
  return Array.isArray(waarde) && waarde.length > 0 && typeof waarde[0] === "number";
}

async function verzamelKandidaten(payload: Payload): Promise<Kandidaat[]> {
  const kandidaten: Kandidaat[] = [];

  const bronnen = await payload.find({
    collection: "knowledge-sources",
    where: { embeddingStatus: { equals: "indexed" } },
    limit: MAX_KANDIDATEN_PER_COLLECTIE,
    overrideAccess: true,
    depth: 0,
  });
  for (const bron of bronnen.docs) {
    if (isEmbeddingVector(bron.embedding)) {
      kandidaten.push({
        type: "knowledge-source",
        id: bron.id,
        title: bron.title,
        embedding: bron.embedding,
      });
    }
    for (const hoofdstuk of (bron.chapters ?? []) as { title: string; embedding?: unknown }[]) {
      if (isEmbeddingVector(hoofdstuk.embedding)) {
        kandidaten.push({
          type: "knowledge-source-chapter",
          id: bron.id,
          title: bron.title,
          chapterTitle: hoofdstuk.title,
          embedding: hoofdstuk.embedding,
        });
      }
    }
  }

  const drafts = await payload.find({
    collection: "knowledge-drafts",
    where: {
      and: [{ embeddingStatus: { equals: "indexed" } }, { status: { in: VEILIGE_DRAFT_STATUSSEN } }],
    },
    limit: MAX_KANDIDATEN_PER_COLLECTIE,
    overrideAccess: true,
    depth: 0,
  });
  for (const draft of drafts.docs) {
    if (isEmbeddingVector(draft.embedding)) {
      kandidaten.push({
        type: "knowledge-draft",
        id: draft.id,
        title: draft.title,
        embedding: draft.embedding,
      });
    }
  }

  const artikelen = await payload.find({
    collection: "articles",
    where: { embeddingStatus: { equals: "indexed" } },
    limit: MAX_KANDIDATEN_PER_COLLECTIE,
    overrideAccess: true,
    depth: 0,
  });
  for (const artikel of artikelen.docs) {
    if (isEmbeddingVector(artikel.embedding)) {
      kandidaten.push({
        type: "article",
        id: artikel.id,
        title: artikel.title,
        embedding: artikel.embedding,
      });
    }
  }

  return kandidaten;
}

export async function searchKnowledge(
  payload: Payload,
  opties: { query: string; limiet?: number }
): Promise<SearchHit[]> {
  const limiet = opties.limiet ?? STANDAARD_ZOEKLIMIET;
  const queryEmbedding = await generateEmbedding(opties.query);
  const kandidaten = await verzamelKandidaten(payload);

  const hits: SearchHit[] = kandidaten.map((k) => {
    const similarity = cosineSimilarity(queryEmbedding, k.embedding);
    return {
      type: k.type,
      id: k.id,
      title: k.title,
      chapterTitle: k.chapterTitle,
      similarity,
      reason: bouwReden(k.type, similarity, k.chapterTitle),
    };
  });

  hits.sort((a, b) => b.similarity - a.similarity);
  return hits.slice(0, limiet);
}
