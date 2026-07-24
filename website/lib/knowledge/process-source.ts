import type { Payload } from "payload";
import { optionalEnv } from "@/config/env";
import { getAiModelId } from "@/services/ai-client";
import { genereerDownloadUrl } from "@/services/storage";
import { indexeerBron, type BronVoorIndexering } from "./index-source";
import { findRelatedDraftIds } from "./link-drafts";

// Verwerkt één kennisbron volledig: bestand ophalen (voor PDF's), de
// inhoudslogica in lib/knowledge/index-source.ts aanroepen, het resultaat
// wegschrijven, en (bij succes) deterministisch koppelen aan bestaande
// knowledge-drafts (lib/knowledge/link-drafts.ts) — de Payload-tegenhanger
// van lib/support/analyze.ts. Schrijft nooit naar de oorspronkelijke
// geüploade bestanden/media-collectie, uitsluitend naar de eigen
// knowledge-sources- en knowledge-drafts-documenten.
//
// Status gaat UITSLUITEND naar "indexed" nadat er daadwerkelijk een geldig
// resultaat is verwerkt — elke fout resulteert in "error" met de technische
// reden in indexError, nooit stilzwijgend "indexed".

function isAbsoluteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * Handleidingen (Sprint 6) wijzen NIET naar een publiek geüpload media-
 * bestand, maar rechtstreeks naar de al bestaande, private Blob (zie
 * lib/knowledge/sync-manuals.ts's maakMediaDoc — geen tweede upload via de
 * gedeelde vercelBlobStorage-plugin, die alleen publieke toegang ondersteunt
 * en dus zou botsen met een private store). Zo'n opgeslagen URL is dus NIET
 * rechtstreeks fetch()-baar; herkenbaar aan het `*.private.blob.vercel-
 * storage.com`-hostnamepatroon dat @vercel/blob zelf gebruikt (zie
 * constructBlobUrl in node_modules/@vercel/blob). In dat geval wordt hier,
 * vlak voor gebruik, een kortlevende signed URL gegenereerd — dezelfde
 * services/storage.ts-aanpak als contactformulierbijlagen — zodat ook
 * herhaald herindexeren (dagen/maanden later) blijft werken, i.p.v. één keer
 * een vaste maar op termijn verlopen signed URL op te slaan.
 */
function isPrivateBlobUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".private.blob.vercel-storage.com");
  } catch {
    return false;
  }
}

async function resolveerBestandsUrl(payload: Payload, mediaId: number): Promise<string | null> {
  const media = await payload.findByID({ collection: "media", id: mediaId, overrideAccess: true, depth: 0 });
  const url = media?.url;
  if (!url) return null;
  if (isPrivateBlobUrl(url)) {
    const pathname = new URL(url).pathname.replace(/^\//, "");
    return genereerDownloadUrl(pathname);
  }
  if (isAbsoluteUrl(url)) return url;
  const basis = optionalEnv("NEXT_PUBLIC_SERVER_URL") ?? "http://localhost:3000";
  return `${basis}${url}`;
}

export interface BronRecord {
  id: number;
  title: string;
  type: BronVoorIndexering["type"];
  file?: number | null;
  url?: string | null;
  description?: string | null;
  transcript?: string | null;
}

export type ProcesUitkomst = { type: "indexed" } | { type: "failed"; foutmelding: string };

export async function processKnowledgeSource(payload: Payload, bron: BronRecord): Promise<ProcesUitkomst> {
  let fileUrl: string | null = null;
  if (bron.type === "pdf" && bron.file) {
    fileUrl = await resolveerBestandsUrl(payload, bron.file);
  }

  const uitkomst = await indexeerBron({
    title: bron.title,
    type: bron.type,
    description: bron.description,
    url: bron.url,
    transcript: bron.transcript,
    fileUrl,
  });

  if (uitkomst.type === "failed") {
    await payload.update({
      collection: "knowledge-sources",
      id: bron.id,
      overrideAccess: true,
      data: { status: "error", indexError: uitkomst.foutmelding },
    });
    return { type: "failed", foutmelding: uitkomst.foutmelding };
  }

  await payload.update({
    collection: "knowledge-sources",
    id: bron.id,
    overrideAccess: true,
    data: {
      status: "indexed",
      indexError: null,
      aiSummary: uitkomst.summary,
      aiKeywords: uitkomst.keywords,
      aiCategory: uitkomst.category,
      aiModel: getAiModelId(),
      aiIndexedAt: new Date().toISOString(),
      chapters: uitkomst.chapters,
      ...(uitkomst.transcript ? { transcript: uitkomst.transcript } : {}),
    },
  });

  // Deterministische, tweerichtingskoppeling met bestaande concepten — zie
  // lib/knowledge/link-drafts.ts. Bij herindexeren wordt dit steeds volledig
  // herberekend (nooit stapelend), zodat verouderde koppelingen verdwijnen.
  const gerelateerdeDraftIds = await findRelatedDraftIds(payload, {
    title: bron.title,
    category: uitkomst.category,
    keywords: uitkomst.keywords,
  });

  for (const draftId of gerelateerdeDraftIds) {
    const draft = await payload.findByID({
      collection: "knowledge-drafts",
      id: draftId,
      overrideAccess: true,
      depth: 0,
    });
    const bestaandeSources = ((draft.knowledgeSources ?? []) as (number | { id: number })[]).map((s) =>
      typeof s === "number" ? s : s.id
    );
    await payload.update({
      collection: "knowledge-drafts",
      id: draftId,
      overrideAccess: true,
      data: { knowledgeSources: [...new Set([...bestaandeSources, bron.id])] },
    });
  }

  await payload.update({
    collection: "knowledge-sources",
    id: bron.id,
    overrideAccess: true,
    data: { knowledgeDrafts: gerelateerdeDraftIds },
  });

  return { type: "indexed" };
}
