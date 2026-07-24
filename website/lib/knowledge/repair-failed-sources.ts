import type { Payload } from "payload";
import { processKnowledgeSource, type BronRecord } from "./process-source";
import { embedKnowledgeSource } from "@/lib/embeddings/process-embedding";

// Herstelt Knowledge Sources met status "error" (bv. de "Kon PDF niet
// ophalen (HTTP 403)"-fout van vóór de private-Blob-signing-fix in
// lib/knowledge/process-source.ts) — zie app/api/knowledge/repair-failed/
// route.ts (de enige aanroeper). Bouwt GEEN nieuw indexeer-/embedsysteem:
// hergebruikt processKnowledgeSource (Sprint 3) en embedKnowledgeSource
// (Sprint 4) rechtstreeks, exact zoals lib/knowledge/sync-manuals.ts dat al
// doet voor nieuwe/gewijzigde bronnen — dit is de tegenhanger voor
// BESTAANDE bronnen die al een mislukte poging achter de rug hebben. Raakt
// Vercel Blob/de sync-pijplijn niet aan: uitsluitend een herindexeer- +
// herembed-poging op reeds bestaande knowledge-sources-documenten, "zonder
// alles opnieuw te importeren".
//
// Alleen status "error" (niet "new"): "new" betekent nog nooit een poging
// gedaan, dat hoort bij de gewone indexeerknop/-route
// (lib/knowledge/run-indexing.ts) — deze functie is specifiek voor bronnen
// die AL geprobeerd zijn en zijn MISLUKT.

export const STANDAARD_LIMIET = 5;
const HARDE_MAX_LIMIET = 25; // zelfde orde van grootte als lib/knowledge/run-indexing.ts

export interface MislukteBron {
  id: number;
  title: string;
  indexError: string | null;
}

export interface RepairSamenvatting {
  /** Alle bronnen met status "error" op het moment van aanroepen (vóór verwerking) — de gevraagde "lijst". */
  gevonden: MislukteBron[];
  /** Hoeveel van de gevonden bronnen dit verzoek daadwerkelijk opnieuw heeft geprobeerd (begrensd door limiet). */
  verwerkt: number;
  heringedexeerd: number;
  geembed: number;
  nogSteedsMislukt: number;
  fouten: string[];
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

export async function repairFailedKnowledgeSources(
  payload: Payload,
  opties: { limiet?: number } = {}
): Promise<RepairSamenvatting> {
  const limiet = Math.min(opties.limiet ?? STANDAARD_LIMIET, HARDE_MAX_LIMIET);

  const mislukt = await payload.find({
    collection: "knowledge-sources",
    where: { status: { equals: "error" } },
    sort: "-updatedAt",
    limit: HARDE_MAX_LIMIET,
    overrideAccess: true,
  });

  const gevonden: MislukteBron[] = mislukt.docs.map((d) => ({
    id: d.id,
    title: d.title,
    indexError: d.indexError ?? null,
  }));

  const samenvatting: RepairSamenvatting = {
    gevonden,
    verwerkt: 0,
    heringedexeerd: 0,
    geembed: 0,
    nogSteedsMislukt: 0,
    fouten: [],
  };

  for (const doc of mislukt.docs.slice(0, limiet)) {
    const bron = naarBronRecord(doc);
    samenvatting.verwerkt += 1;

    try {
      await payload.update({
        collection: "knowledge-sources",
        id: bron.id,
        overrideAccess: true,
        data: { status: "indexing" },
      });

      const indexUitkomst = await processKnowledgeSource(payload, bron);
      if (indexUitkomst.type === "failed") {
        samenvatting.nogSteedsMislukt += 1;
        samenvatting.fouten.push(`Bron ${bron.id} (${bron.title}): ${indexUitkomst.foutmelding}`);
        continue;
      }
      samenvatting.heringedexeerd += 1;

      const embedUitkomst = await embedKnowledgeSource(payload, bron.id);
      if (embedUitkomst.type === "failed") {
        samenvatting.nogSteedsMislukt += 1;
        samenvatting.fouten.push(
          `Bron ${bron.id} (${bron.title}): embedden mislukt — ${embedUitkomst.foutmelding}`
        );
        continue;
      }
      if (embedUitkomst.type === "embedded") samenvatting.geembed += 1;
    } catch (error) {
      const boodschap = error instanceof Error ? error.message : String(error);
      samenvatting.nogSteedsMislukt += 1;
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
