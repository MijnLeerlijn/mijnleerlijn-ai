import type { Payload } from "payload";
import { processKnowledgeSource, type BronRecord } from "./process-source";

// Orkestreert een indexeerronde over meerdere kennisbronnen — zie
// app/api/knowledge/index/route.ts (de enige aanroeper). Zelfde opzet als
// lib/support/run-analysis.ts: elke bron onafhankelijk (try/catch), status
// pas bijgewerkt ná een afgeronde uitkomst, nooit vooraf op "indexed" gezet.

export const STANDAARD_LIMIET = 5;
const HARDE_MAX_LIMIET = 25; // zelfde orde van grootte als de Gmail-sync-/supportanalyse-cap

export interface IndexeerSamenvatting {
  verwerkt: number;
  geindexeerd: number;
  mislukt: number;
  fouten: string[];
}

async function selecteerBronnen(
  payload: Payload,
  sourceIds: number[] | undefined,
  limiet: number
): Promise<BronRecord[]> {
  if (sourceIds && sourceIds.length > 0) {
    const beperkt = sourceIds.slice(0, HARDE_MAX_LIMIET);
    const docs = await Promise.all(
      beperkt.map((id) => payload.findByID({ collection: "knowledge-sources", id, overrideAccess: true }))
    );
    return docs.map(naarBronRecord);
  }

  const resultaat = await payload.find({
    collection: "knowledge-sources",
    where: { status: { in: ["new", "error"] } },
    sort: "-createdAt",
    limit: Math.min(limiet, HARDE_MAX_LIMIET),
    overrideAccess: true,
  });
  return resultaat.docs.map(naarBronRecord);
}

function naarBronRecord(doc: {
  id: number;
  title: string;
  type: BronRecord["type"];
  file?: number | { id: number } | null;
  url?: string | null;
  description?: string | null;
  transcript?: string | null;
}): BronRecord {
  return {
    id: doc.id,
    title: doc.title,
    type: doc.type,
    file: typeof doc.file === "object" && doc.file !== null ? doc.file.id : (doc.file ?? null),
    url: doc.url,
    description: doc.description,
    transcript: doc.transcript,
  };
}

export async function runKnowledgeIndexing(
  payload: Payload,
  opties: { sourceIds?: number[]; limiet?: number }
): Promise<IndexeerSamenvatting> {
  const bronnen = await selecteerBronnen(payload, opties.sourceIds, opties.limiet ?? STANDAARD_LIMIET);

  const samenvatting: IndexeerSamenvatting = {
    verwerkt: 0,
    geindexeerd: 0,
    mislukt: 0,
    fouten: [],
  };

  for (const bron of bronnen) {
    try {
      await payload.update({
        collection: "knowledge-sources",
        id: bron.id,
        overrideAccess: true,
        data: { status: "indexing" },
      });

      const uitkomst = await processKnowledgeSource(payload, bron);
      samenvatting.verwerkt += 1;

      if (uitkomst.type === "failed") {
        samenvatting.mislukt += 1;
        samenvatting.fouten.push(`Bron ${bron.id} (${bron.title}): ${uitkomst.foutmelding}`);
        continue;
      }

      samenvatting.geindexeerd += 1;
    } catch (error) {
      const boodschap = error instanceof Error ? error.message : String(error);
      samenvatting.mislukt += 1;
      samenvatting.fouten.push(`Bron ${bron.id} (${bron.title}): onverwachte fout — ${boodschap}`);
      await payload
        .update({
          collection: "knowledge-sources",
          id: bron.id,
          overrideAccess: true,
          data: { status: "error", indexError: `Onverwachte fout: ${boodschap}` },
        })
        .catch(() => undefined);
    }
  }

  return samenvatting;
}
