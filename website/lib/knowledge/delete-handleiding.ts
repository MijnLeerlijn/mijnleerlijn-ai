import type { Payload, PayloadRequest } from "payload";

// Handleidingbouwer: "verwijderen inclusief afgeleide data" — naar het
// precedent van lib/knowledge/delete-source.ts (ruimKnowledgeSourceBijlagenOp),
// maar dan voor de media-uploads van elke stap. Stap-chunks/embeddings zelf
// verdwijnen automatisch mee (array-subtabel, FK-cascade, zelfde als
// KnowledgeSources.chapters) — hier wordt uitsluitend het gekoppelde
// Media-document per stapafbeelding opgeruimd.
//
// ANDERS dan bij KnowledgeSources: stapafbeeldingen worden via een ECHTE
// Payload-upload geüpload (het gewone `upload`-veld in de admin-UI, geen
// bypass naar een vooraf bestaande Blob zoals sync-manuals.ts doet) — de
// gedeelde vercelBlobStorage-plugin (payload.config.ts) ruimt de
// onderliggende Blob dus AL zelf op zodra het Media-document verwijderd
// wordt. Geen aparte del()-aanroep nodig zoals bij de private PDF-opslag.
export interface HandleidingVerwijderResultaat {
  mediaVerwijderd: number;
  mediaMislukt: number;
}

interface StapVoorVerwijdering {
  media?: { bestand?: number | string | { id: number | string } | null }[] | null;
}

interface HandleidingDocVoorVerwijdering {
  stappen?: StapVoorVerwijdering[] | null;
}

export async function ruimHandleidingMediaOp(
  payload: Payload,
  doc: HandleidingDocVoorVerwijdering,
  req?: Partial<PayloadRequest>
): Promise<HandleidingVerwijderResultaat> {
  const resultaat: HandleidingVerwijderResultaat = { mediaVerwijderd: 0, mediaMislukt: 0 };

  const mediaIds = (doc.stappen ?? [])
    .flatMap((stap) => stap.media ?? [])
    .map((m) => (typeof m.bestand === "object" && m.bestand ? m.bestand.id : m.bestand))
    .filter((id): id is number | string => id !== null && id !== undefined);

  for (const mediaId of mediaIds) {
    try {
      await payload.delete({ collection: "media", id: mediaId, overrideAccess: true, req });
      resultaat.mediaVerwijderd += 1;
    } catch {
      // Media-document al verwijderd, of nooit gekoppeld — geen fatale fout.
      resultaat.mediaMislukt += 1;
    }
  }

  return resultaat;
}
