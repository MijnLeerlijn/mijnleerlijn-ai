import type { Payload } from "payload";
import { scanManualsDirectory, readManualFile, titleFromFilename, type ManualFile } from "./manuals-scan";
import { processKnowledgeSource } from "./process-source";
import { embedKnowledgeSource } from "@/lib/embeddings/process-embedding";

// Synchroniseert website/handleidingen/ met de knowledge-sources-collectie —
// zie app/api/knowledge/sync-manuals/route.ts (de enige aanroeper). Bouwt
// GEEN nieuw indexeer-/embedsysteem: hergebruikt processKnowledgeSource
// (lib/knowledge/process-source.ts, Sprint 3) en embedKnowledgeSource
// (lib/embeddings/process-embedding.ts, Sprint 4) rechtstreeks, precies
// zoals de opdracht vereist ("Bouw geen tweede parallel systeem").
//
// Idempotentie/dedup, in twee stappen per bestand:
// 1. Bestaat er al een bron met exact dit sourceFilePath? Zo ja: vergelijk
//    sourceFileHash — ongewijzigd → overslaan (geen AI-aanroep); gewijzigd
//    → nieuw mediabestand + herindexeren + herembedden.
// 2. Geen bron met dit pad: bestaat er een bron met exact deze
//    sourceFileHash onder een ANDER pad? Zo ja: content-duplicaat (bv.
//    "Analyse.pdf" vs. "Analyse (1).pdf") — nooit een tweede bron aanmaken,
//    wél rapporteren, niets verwijderen.
// 3. Anders: genuine nieuwe bron.
//
// `limiet` begrenst uitsluitend hoeveel NIEUWE/GEWIJZIGDE bestanden dit
// verzoek daadwerkelijk (her)indexeert + (her)embedt — scannen/hashen van
// de hele map blijft altijd goedkoop en gebeurt altijd volledig. PDF-tekst
// uitlezen + twee AI-aanroepen per bestand is zwaar genoeg (en Vercel-
// functies hebben een tijdslimiet) dat één verzoek nooit alle bestanden
// tegelijk mag proberen te verwerken — zelfde soort veiligheidscap als
// STANDAARD_LIMIET/HARDE_MAX_LIMIET elders in lib/knowledge//lib/embeddings/.

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

async function maakMediaDoc(payload: Payload, bestand: ManualFile, buffer: Buffer, titel: string): Promise<number> {
  const media = await payload.create({
    collection: "media",
    overrideAccess: true,
    data: { altText: titel, mediaType: "download" },
    file: { data: buffer, mimetype: "application/pdf", name: bestand.filename, size: buffer.length },
  });
  return media.id;
}

export async function syncManuals(payload: Payload, opties: { limiet?: number } = {}): Promise<SyncManualsSamenvatting> {
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

  const bestanden = await scanManualsDirectory();
  samenvatting.gevonden = bestanden.length;

  let verwerktDitVerzoek = 0;

  for (const bestand of bestanden) {
    let buffer: Buffer;
    let hash: string;
    try {
      ({ buffer, hash } = await readManualFile(bestand));
    } catch (error) {
      samenvatting.mislukt += 1;
      const boodschap = error instanceof Error ? error.message : String(error);
      samenvatting.fouten.push(`${bestand.relativePath}: kon bestand niet lezen — ${boodschap}`);
      continue;
    }

    const bestaandeVoorPad = await payload.find({
      collection: "knowledge-sources",
      where: { sourceFilePath: { equals: bestand.relativePath } },
      limit: 1,
      overrideAccess: true,
      depth: 0,
    });
    const bestaandeBron = bestaandeVoorPad.docs[0];

    if (bestaandeBron) {
      if (bestaandeBron.sourceFileHash === hash) {
        samenvatting.ongewijzigdOvergeslagen += 1;
        continue;
      }

      if (verwerktDitVerzoek >= limiet) continue; // bestand wacht tot een volgende ronde, telt niet mee als fout

      try {
        const titel = bestaandeBron.title || titleFromFilename(bestand.filename);
        const mediaId = await maakMediaDoc(payload, bestand, buffer, titel);
        await payload.update({
          collection: "knowledge-sources",
          id: bestaandeBron.id,
          overrideAccess: true,
          data: { file: mediaId, sourceFileHash: hash, status: "new" },
        });
        samenvatting.bijgewerkt += 1;
        verwerktDitVerzoek += 1;
        await indexeerEnEmbed(payload, bestaandeBron.id, titel, mediaId, bestand.relativePath, samenvatting);
      } catch (error) {
        samenvatting.mislukt += 1;
        const boodschap = error instanceof Error ? error.message : String(error);
        samenvatting.fouten.push(`${bestand.relativePath}: ${boodschap}`);
      }
      continue;
    }

    const bestaandeVoorHash = await payload.find({
      collection: "knowledge-sources",
      where: { sourceFileHash: { equals: hash } },
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
      const titel = titleFromFilename(bestand.filename);
      const mediaId = await maakMediaDoc(payload, bestand, buffer, titel);
      const nieuweBron = await payload.create({
        collection: "knowledge-sources",
        overrideAccess: true,
        data: {
          title: titel,
          type: "pdf",
          file: mediaId,
          sourceFilePath: bestand.relativePath,
          sourceFileHash: hash,
          status: "new",
          embeddingStatus: "pending",
        },
      });
      samenvatting.nieuw += 1;
      verwerktDitVerzoek += 1;
      await indexeerEnEmbed(payload, nieuweBron.id, titel, mediaId, bestand.relativePath, samenvatting);
    } catch (error) {
      samenvatting.mislukt += 1;
      const boodschap = error instanceof Error ? error.message : String(error);
      samenvatting.fouten.push(`${bestand.relativePath}: ${boodschap}`);
    }
  }

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
  }).catch((error) => ({ type: "failed" as const, foutmelding: error instanceof Error ? error.message : String(error) }));

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
