import type { Payload, PayloadRequest } from "payload";
import { del } from "@vercel/blob";
import { blobAuthOptions } from "@/services/storage";
import { blobPathnameVoor } from "@/lib/knowledge/manuals-blob";

// Livegang-afwerking: "verwijder een kennisbron nooit alleen uit de tabel" —
// chapters/embeddings staan als array-subveld ONDER het KnowledgeSource-
// document zelf (payload/collections/KnowledgeSources.ts, veld `chapters`),
// dus die verdwijnen altijd automatisch mee met een payload.delete() op de
// bron (Postgres-array-subtabel, FK ON DELETE CASCADE — geen aparte actie
// nodig, nooit verweesde chunks/embeddings op DIT niveau). Wat WEL apart
// opgeruimd moet worden: (1) het gekoppelde Media-document, en (2) bij een
// via lib/knowledge/sync-manuals.ts gesynchroniseerde PDF, de onderliggende
// PRIVATE Blob zelf — de gedeelde vercelBlobStorage-plugin (payload.config.ts)
// weet niets van dat bestand (het Media-document wijst rechtstreeks naar
// blob.url zonder een echte upload via de plugin, zie het commentaar
// bovenaan sync-manuals.ts), dus de plugin kan die specifieke Blob nooit uit
// zichzelf opruimen.
export interface VerwijderResultaat {
  mediaVerwijderd: boolean;
  blobVerwijderd: boolean;
}

interface KnowledgeSourceDocVoorVerwijdering {
  file?: number | string | { id: number | string } | null;
  sourceFilePath?: string | null;
  sourceFileHash?: string | null;
}

/**
 * Ruimt alles op wat bij een verwijderde KnowledgeSource hoort, behalve het
 * document zelf (dat is de aanroeper — meestal Payload's eigen delete-
 * operatie, zie de afterDelete-hook in KnowledgeSources.ts). Faalt bewust
 * NOOIT hard op een los onderdeel (bv. Blob al weg, Media al verwijderd):
 * elke stap is individueel best-effort, zodat één mislukt onderdeel niet de
 * hele opruimactie blokkeert — de aanroeper kan het resultaat gebruiken om
 * dit alsnog te loggen/tonen.
 *
 * BELANGRIJK: `req` moet, indien beschikbaar, doorgegeven worden aan de
 * geneste payload.delete() hieronder. Zonder `req` opent Payload een NIEUWE
 * transactie/connectie voor die media-verwijdering — terwijl de buitenste
 * transactie (de eigenlijke KnowledgeSource-verwijdering, vanuit een
 * afterDelete-hook, dus nog niet gecommit) een lock vasthoudt op gerelateerde
 * rijen. Live getest: dat geeft een echte Postgres-deadlock (twee losse
 * transacties die op elkaar wachten), niet alleen een theoretisch risico.
 */
export async function ruimKnowledgeSourceBijlagenOp(
  payload: Payload,
  doc: KnowledgeSourceDocVoorVerwijdering,
  req?: Partial<PayloadRequest>
): Promise<VerwijderResultaat> {
  const resultaat: VerwijderResultaat = { mediaVerwijderd: false, blobVerwijderd: false };

  if (doc.sourceFilePath && doc.sourceFileHash) {
    try {
      const pathname = blobPathnameVoor(doc.sourceFilePath, doc.sourceFileHash);
      await del(pathname, { ...blobAuthOptions() });
      resultaat.blobVerwijderd = true;
    } catch {
      // Blob al verwijderd, of nooit via sync-manuals aangemaakt — geen fatale fout.
    }
  }

  const mediaId = typeof doc.file === "object" && doc.file ? doc.file.id : doc.file;
  if (mediaId) {
    try {
      await payload.delete({ collection: "media", id: mediaId, overrideAccess: true, req });
      resultaat.mediaVerwijderd = true;
    } catch {
      // Media-document al verwijderd — geen fatale fout.
    }
  }

  return resultaat;
}
