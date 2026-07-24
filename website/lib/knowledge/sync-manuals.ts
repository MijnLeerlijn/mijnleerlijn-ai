import type { Payload } from "payload";
import { listManualBlobs, titleFromFilename, type ManualBlob } from "./manuals-blob";
import { processKnowledgeSource } from "./process-source";
import { embedKnowledgeSource } from "@/lib/embeddings/process-embedding";

// Synchroniseert Vercel Blob (prefix handleidingen/, zie lib/knowledge/
// manuals-blob.ts) met de knowledge-sources-collectie — zie app/api/
// knowledge/sync-manuals/route.ts (de enige aanroeper). Bouwt GEEN nieuw
// indexeer-/embedsysteem: hergebruikt processKnowledgeSource
// (lib/knowledge/process-source.ts, Sprint 3) en embedKnowledgeSource
// (lib/embeddings/process-embedding.ts, Sprint 4) rechtstreeks, precies
// zoals de opdracht vereist ("Bouw geen tweede parallel systeem").
//
// Idempotentie/dedup, in twee stappen per bestand — de hash komt rechtstreeks
// uit de Blob-bestandsnaam (ManualBlob.hash), er wordt dus NOOIT gedownload
// om alleen maar te bepalen of iets ongewijzigd is:
// 1. Bestaat er al een bron met exact dit sourceFilePath? Zo ja: vergelijk
//    sourceFileHash — ongewijzigd → overslaan (geen download, geen
//    AI-aanroep); gewijzigd → downloaden + nieuw mediabestand + herindexeren
//    + herembedden.
// 2. Geen bron met dit pad: bestaat er een bron met exact deze
//    sourceFileHash onder een ANDER pad? Zo ja: content-duplicaat (bv.
//    "Analyse.pdf" vs. "Analyse (1).pdf") — nooit een tweede bron aanmaken,
//    wél rapporteren, niets verwijderen.
// 3. Anders: genuine nieuwe bron — downloaden + verwerken.
//
// `limiet` begrenst uitsluitend hoeveel NIEUWE/GEWIJZIGDE bestanden dit
// verzoek daadwerkelijk (her)indexeert + (her)embedt — de Blob-listing zelf
// (goedkoop, geen download) gebeurt altijd volledig. PDF-tekst uitlezen +
// twee AI-aanroepen per bestand is zwaar genoeg (en Vercel-functies hebben
// een tijdslimiet, en sommige handleidingen zijn nu honderden MB's) dat één
// verzoek nooit alle bestanden tegelijk mag proberen te verwerken — zelfde
// soort veiligheidscap als STANDAARD_LIMIET/HARDE_MAX_LIMIET elders in
// lib/knowledge//lib/embeddings/.
//
// GEEN eigen download/re-upload hier: maakMediaDoc hieronder wijst het
// media-document rechtstreeks naar de Blob die het uploadscript al heeft
// geplaatst (blob.url) — geen tweede kopie. De Blob store is bewust private
// (@payloadcms/storage-vercel-blob ondersteunt uitsluitend 'public'
// toegang, zie de plugin-typedefinitie, dus de gedeelde media-collectie kan
// hier niet voor gebruikt worden zonder de site-brede publieke afbeeldingen/
// logo's mee te raken). lib/knowledge/process-source.ts's
// resolveerBestandsUrl herkent deze private-Blob-URL's en genereert er, pas
// op het moment van daadwerkelijk (her)indexeren, een kortlevende signed URL
// voor — zie het commentaar daar.

export const STANDAARD_LIMIET = 5;
const HARDE_MAX_LIMIET = 20;

export interface SyncManualsSamenvatting {
  gevonden: number;
  nieuw: number;
  bijgewerkt: number;
  ongewijzigdOvergeslagen: number;
  duplicaatOvergeslagen: number;
  geindexeerd: number;
  geembed: number;
  mislukt: number;
  fouten: string[];
}

/**
 * Maakt het media-document ZONDER `file:` — dat zou de gedeelde
 * vercelBlobStorage-plugin triggeren, die alleen 'public' toegang
 * ondersteunt en dus zou falen op de private store. In plaats daarvan
 * verwijst dit document rechtstreeks naar de al bestaande Blob (uploadscript
 * heeft 'm al geplaatst) — geen tweede upload, geen dubbele opslag.
 *
 * `focalX`/`focalY` moeten hier expliciet mee, ook al is dit geen
 * afbeelding: Payload's generateFileData vergelijkt bij elke create() zonder
 * `file` de meegegeven focalX/focalY met zijn eigen default (50/50) om te
 * bepalen of het "externe URL" opnieuw opgehaald moet worden
 * (shouldReupload, zie node_modules/payload/dist/uploads/
 * generateFileData.js) — zonder exacte match probeert Payload de URL zelf
 * te fetchen (getExternalFile), wat op de private Blob-URL altijd faalt.
 * Vereist ook `filesRequiredOnCreate: false` op de collectie zelf (zie
 * payload/collections/Media.ts), anders weigert Payload elke create()
 * zonder `file` sowieso.
 */
async function maakMediaDoc(payload: Payload, blob: ManualBlob, titel: string): Promise<number> {
  const filename = blob.relativePath.split("/").pop() ?? blob.relativePath;
  const media = await payload.create({
    collection: "media",
    overrideAccess: true,
    data: {
      altText: titel,
      mediaType: "download",
      filename,
      mimeType: "application/pdf",
      filesize: blob.size,
      url: blob.url,
      focalX: 50,
      focalY: 50,
    },
  });
  return media.id;
}

export async function syncManuals(
  payload: Payload,
  opties: { limiet?: number } = {}
): Promise<SyncManualsSamenvatting> {
  const limiet = Math.min(opties.limiet ?? STANDAARD_LIMIET, HARDE_MAX_LIMIET);

  const samenvatting: SyncManualsSamenvatting = {
    gevonden: 0,
    nieuw: 0,
    bijgewerkt: 0,
    ongewijzigdOvergeslagen: 0,
    duplicaatOvergeslagen: 0,
    geindexeerd: 0,
    geembed: 0,
    mislukt: 0,
    fouten: [],
  };

  const blobs = await listManualBlobs();
  samenvatting.gevonden = blobs.length;
  payload.logger.info(
    `[sync-manuals] ${blobs.length} handleiding-PDF('s) gevonden in Blob (prefix handleidingen/).`
  );

  let verwerktDitVerzoek = 0;

  for (const blob of blobs) {
    const bestaandeVoorPad = await payload.find({
      collection: "knowledge-sources",
      where: { sourceFilePath: { equals: blob.relativePath } },
      limit: 1,
      overrideAccess: true,
      depth: 0,
    });
    const bestaandeBron = bestaandeVoorPad.docs[0];

    if (bestaandeBron) {
      if (bestaandeBron.sourceFileHash === blob.hash) {
        samenvatting.ongewijzigdOvergeslagen += 1;
        continue;
      }

      if (verwerktDitVerzoek >= limiet) continue; // bestand wacht tot een volgende ronde, telt niet mee als fout

      try {
        const filename = blob.relativePath.split("/").pop() ?? blob.relativePath;
        const titel = bestaandeBron.title || titleFromFilename(filename);
        const mediaId = await maakMediaDoc(payload, blob, titel);
        await payload.update({
          collection: "knowledge-sources",
          id: bestaandeBron.id,
          overrideAccess: true,
          data: { file: mediaId, sourceFileHash: blob.hash, status: "new" },
        });
        samenvatting.bijgewerkt += 1;
        verwerktDitVerzoek += 1;
        await indexeerEnEmbed(payload, bestaandeBron.id, titel, mediaId, blob.relativePath, samenvatting);
      } catch (error) {
        samenvatting.mislukt += 1;
        const boodschap = error instanceof Error ? error.message : String(error);
        samenvatting.fouten.push(`${blob.relativePath}: ${boodschap}`);
      }
      continue;
    }

    const bestaandeVoorHash = await payload.find({
      collection: "knowledge-sources",
      where: { sourceFileHash: { equals: blob.hash } },
      limit: 1,
      overrideAccess: true,
      depth: 0,
    });
    if (bestaandeVoorHash.docs.length > 0) {
      samenvatting.duplicaatOvergeslagen += 1;
      continue;
    }

    if (verwerktDitVerzoek >= limiet) continue;

    try {
      const filename = blob.relativePath.split("/").pop() ?? blob.relativePath;
      const titel = titleFromFilename(filename);
      const mediaId = await maakMediaDoc(payload, blob, titel);
      const nieuweBron = await payload.create({
        collection: "knowledge-sources",
        overrideAccess: true,
        data: {
          title: titel,
          type: "pdf",
          priority: "core",
          file: mediaId,
          sourceFilePath: blob.relativePath,
          sourceFileHash: blob.hash,
          status: "new",
          embeddingStatus: "pending",
        },
      });
      samenvatting.nieuw += 1;
      verwerktDitVerzoek += 1;
      await indexeerEnEmbed(payload, nieuweBron.id, titel, mediaId, blob.relativePath, samenvatting);
    } catch (error) {
      samenvatting.mislukt += 1;
      const boodschap = error instanceof Error ? error.message : String(error);
      samenvatting.fouten.push(`${blob.relativePath}: ${boodschap}`);
    }
  }

  const overgeslagen = samenvatting.ongewijzigdOvergeslagen + samenvatting.duplicaatOvergeslagen;
  payload.logger.info(
    `[sync-manuals] Blob: ${samenvatting.gevonden} · Nieuw: ${samenvatting.nieuw} · Bijgewerkt: ${samenvatting.bijgewerkt} · Overgeslagen: ${overgeslagen} (ongewijzigd: ${samenvatting.ongewijzigdOvergeslagen}, duplicaat: ${samenvatting.duplicaatOvergeslagen}) · Mislukt: ${samenvatting.mislukt}`
  );

  return samenvatting;
}

async function indexeerEnEmbed(
  payload: Payload,
  sourceId: number,
  title: string,
  mediaId: number,
  relativePath: string,
  samenvatting: SyncManualsSamenvatting
): Promise<void> {
  // type MOET "pdf" zijn, niet "handleiding": lib/knowledge/process-source.ts
  // haalt het bestand alleen op voor type "pdf" (zie resolveerBestandsUrl,
  // Sprint 3) — "handleiding" is in het bestaande datamodel een apart,
  // URL-gebaseerd brontype (zie payload/collections/KnowledgeSources.ts,
  // het veld `file` heeft conditie `type === "pdf"`). De "Handleiding"-label
  // die de assistent toont komt uit lib/assistant/build-context.ts, dat
  // zowel "pdf" als "handleiding" al naar hetzelfde label "Handleiding"
  // vertaalt — functioneel dus geen verschil voor de eindgebruiker.
  const indexUitkomst = await processKnowledgeSource(payload, {
    id: sourceId,
    title,
    type: "pdf",
    file: mediaId,
  }).catch((error) => ({
    type: "failed" as const,
    foutmelding: error instanceof Error ? error.message : String(error),
  }));

  if (indexUitkomst.type === "failed") {
    samenvatting.mislukt += 1;
    samenvatting.fouten.push(`${relativePath}: indexeren mislukt — ${indexUitkomst.foutmelding}`);
    return;
  }
  samenvatting.geindexeerd += 1;

  const embedUitkomst = await embedKnowledgeSource(payload, sourceId).catch((error) => ({
    type: "failed" as const,
    foutmelding: error instanceof Error ? error.message : String(error),
  }));

  if (embedUitkomst.type === "failed") {
    samenvatting.mislukt += 1;
    samenvatting.fouten.push(`${relativePath}: embedden mislukt — ${embedUitkomst.foutmelding}`);
    return;
  }
  if (embedUitkomst.type === "embedded") samenvatting.geembed += 1;
}
