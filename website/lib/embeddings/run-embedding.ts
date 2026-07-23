import type { Payload } from "payload";
import {
  embedKnowledgeSource,
  embedKnowledgeDraft,
  embedArticle,
  type ProcesUitkomst,
} from "./process-embedding";

// Orkestreert een embed-ronde — zie app/api/knowledge/embed/route.ts (de
// enige aanroeper). Zelfde opzet als lib/knowledge/run-indexing.ts: elk
// document onafhankelijk (try/catch), status pas bijgewerkt ná een
// afgeronde uitkomst.
//
// Zonder expliciete `collection` worden ALLE DRIE collecties verwerkt (elk
// tot `limiet` documenten) — handig voor één algehele "maak embeddings
// bij"-aanroep. Met `collection` maar zonder `ids`: automatische selectie
// binnen die ene collectie (status pending/stale). Met `ids`: vereist ook
// `collection` (ID's zijn niet uniek over collecties heen) — dit wordt door
// de route gevalideerd, niet hier.

export const STANDAARD_LIMIET = 5;
const HARDE_MAX_LIMIET = 25;

export type EmbeddableCollectie = "knowledge-sources" | "knowledge-drafts" | "articles";
const ALLE_COLLECTIES: EmbeddableCollectie[] = ["knowledge-sources", "knowledge-drafts", "articles"];

const PROCESSORS: Record<EmbeddableCollectie, (payload: Payload, id: number) => Promise<ProcesUitkomst>> = {
  "knowledge-sources": embedKnowledgeSource,
  "knowledge-drafts": embedKnowledgeDraft,
  articles: embedArticle,
};

export interface EmbedSamenvatting {
  verwerkt: number;
  geembed: number;
  overgeslagen: number;
  genegeerd: number;
  mislukt: number;
  fouten: string[];
}

async function selecteerIds(
  payload: Payload,
  collectie: EmbeddableCollectie,
  limiet: number
): Promise<number[]> {
  const limit = Math.min(limiet, HARDE_MAX_LIMIET);

  if (collectie === "articles") {
    const resultaat = await payload.find({
      collection: "articles",
      where: {
        and: [
          { embeddingStatus: { in: ["pending", "stale"] } },
          { articleStatus: { equals: "gepubliceerd" } },
        ],
      },
      limit,
      overrideAccess: true,
      depth: 0,
    });
    return resultaat.docs.map((d) => d.id);
  }

  const resultaat = await payload.find({
    collection: collectie,
    where: { embeddingStatus: { in: ["pending", "stale"] } },
    limit,
    overrideAccess: true,
    depth: 0,
  });
  return resultaat.docs.map((d) => d.id);
}

export async function runKnowledgeEmbedding(
  payload: Payload,
  opties: { collection?: EmbeddableCollectie; ids?: number[]; limiet?: number }
): Promise<EmbedSamenvatting> {
  const limiet = opties.limiet ?? STANDAARD_LIMIET;
  const samenvatting: EmbedSamenvatting = {
    verwerkt: 0,
    geembed: 0,
    overgeslagen: 0,
    genegeerd: 0,
    mislukt: 0,
    fouten: [],
  };
  const collecties: EmbeddableCollectie[] = opties.collection ? [opties.collection] : ALLE_COLLECTIES;

  for (const collectie of collecties) {
    const ids =
      opties.collection && opties.ids && opties.ids.length > 0
        ? opties.ids.slice(0, HARDE_MAX_LIMIET)
        : await selecteerIds(payload, collectie, limiet);

    for (const id of ids) {
      samenvatting.verwerkt += 1;
      try {
        const uitkomst = await PROCESSORS[collectie](payload, id);
        if (uitkomst.type === "embedded") samenvatting.geembed += 1;
        else if (uitkomst.type === "skipped") samenvatting.overgeslagen += 1;
        else if (uitkomst.type === "ignored") samenvatting.genegeerd += 1;
        else {
          samenvatting.mislukt += 1;
          samenvatting.fouten.push(`${collectie} ${id}: ${uitkomst.foutmelding}`);
        }
      } catch (error) {
        const boodschap = error instanceof Error ? error.message : String(error);
        samenvatting.mislukt += 1;
        samenvatting.fouten.push(`${collectie} ${id}: onverwachte fout — ${boodschap}`);
      }
    }
  }

  return samenvatting;
}
