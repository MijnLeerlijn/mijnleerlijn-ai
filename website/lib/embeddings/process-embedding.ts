import type { Payload, PayloadRequest } from "payload";
import type { Handleidingen } from "@/types/payload-generated";
import { embedIfChanged } from "./embed-record";
import {
  buildKnowledgeSourceText,
  buildChapterText,
  buildKnowledgeDraftText,
  buildArticleText,
  buildHandleidingText,
  buildStapText,
} from "./embeddable-text";

// Payload-orkestratie per document: tekst opbouwen, lib/embeddings/
// embed-record.ts aanroepen, resultaat wegschrijven. De Payload-tegenhanger
// van lib/embeddings/embed-record.ts, zelfde scheiding als lib/knowledge/
// index-source.ts vs. process-source.ts.
//
// Nooit de brondocumenten (het geüploade PDF-bestand, de originele Gmail-
// thread, enz.) aanpassen — uitsluitend de eigen embedding-velden.

export type ProcesUitkomst =
  | { type: "embedded" }
  | { type: "skipped" }
  | { type: "ignored"; reden: string }
  | { type: "failed"; foutmelding: string };

interface Chapter {
  id?: string;
  title: string;
  summary: string;
  order: number;
  embedding?: number[] | null;
  embeddingTextHash?: string | null;
}

export async function embedKnowledgeSource(payload: Payload, id: number): Promise<ProcesUitkomst> {
  const bron = await payload.findByID({
    collection: "knowledge-sources",
    id,
    overrideAccess: true,
    depth: 0,
  });

  const chapters = ((bron.chapters ?? []) as Chapter[]).slice();
  let chapterFout: string | null = null;
  for (let i = 0; i < chapters.length; i += 1) {
    const hoofdstuk = chapters[i]!;
    const uitkomst = await embedIfChanged({
      text: buildChapterText(hoofdstuk),
      storedHash: hoofdstuk.embeddingTextHash,
      storedStatus: hoofdstuk.embedding ? "indexed" : undefined,
    });
    if (uitkomst.type === "embedded") {
      chapters[i] = { ...hoofdstuk, embedding: uitkomst.embedding, embeddingTextHash: uitkomst.hash };
    } else if (uitkomst.type === "failed") {
      chapterFout = `hoofdstuk "${hoofdstuk.title}": ${uitkomst.foutmelding}`;
    }
  }

  const tekst = buildKnowledgeSourceText({
    title: bron.title,
    aiSummary: bron.aiSummary,
    aiKeywords: bron.aiKeywords,
    aiCategory: bron.aiCategory,
  });
  const uitkomst = await embedIfChanged({
    text: tekst,
    storedHash: bron.embeddingTextHash,
    storedStatus: bron.embeddingStatus,
  });

  if (uitkomst.type === "failed") {
    await payload.update({
      collection: "knowledge-sources",
      id,
      overrideAccess: true,
      data: { embeddingStatus: "stale", chapters },
    });
    return {
      type: "failed",
      foutmelding: chapterFout ? `${uitkomst.foutmelding}; ${chapterFout}` : uitkomst.foutmelding,
    };
  }

  if (
    uitkomst.type === "skipped" &&
    chapters.every((h, i) => h === (bron.chapters as Chapter[] | undefined)?.[i])
  ) {
    return chapterFout ? { type: "failed", foutmelding: chapterFout } : { type: "skipped" };
  }

  await payload.update({
    collection: "knowledge-sources",
    id,
    overrideAccess: true,
    data: {
      embeddingStatus: chapterFout ? "stale" : "indexed",
      embeddedAt: new Date().toISOString(),
      embeddingModel: uitkomst.type === "embedded" ? uitkomst.model : bron.embeddingModel,
      embeddingTextHash: uitkomst.type === "embedded" ? uitkomst.hash : bron.embeddingTextHash,
      embedding: uitkomst.type === "embedded" ? uitkomst.embedding : bron.embedding,
      chapters,
    },
  });

  return chapterFout ? { type: "failed", foutmelding: chapterFout } : { type: "embedded" };
}

// Sprint 6: alleen 'approved' knowledge-drafts mogen geëmbed worden (en dus
// door de assistent als bron gebruikt worden) — zie het uitgebreide
// commentaar bij VEILIGE_DRAFT_STATUSSEN in lib/embeddings/similarity-search.ts
// voor de volledige afweging. Zelfde hard-in-code-afgedwongen aanpak als
// embedArticle() hieronder (articleStatus/aiApprovalStatus), i.p.v. alleen
// op de auto-selectiequery in run-embedding.ts te vertrouwen — een
// expliciete id-selectie mag deze poort nooit omzeilen.
const VEILIGE_DRAFT_STATUSSEN = ["approved"];

export async function embedKnowledgeDraft(payload: Payload, id: number): Promise<ProcesUitkomst> {
  const draft = await payload.findByID({
    collection: "knowledge-drafts",
    id,
    overrideAccess: true,
    depth: 0,
  });

  if (!VEILIGE_DRAFT_STATUSSEN.includes(draft.status)) {
    return {
      type: "ignored",
      reden: `Alleen goedgekeurde concepten (status 'approved') worden geëmbed — huidige status: '${draft.status}'.`,
    };
  }

  const tekst = buildKnowledgeDraftText({
    title: draft.title,
    question: draft.question,
    shortAnswer: draft.shortAnswer,
    fullAnswer: draft.fullAnswer,
    category: draft.category,
    keywords: draft.keywords,
  });
  const uitkomst = await embedIfChanged({
    text: tekst,
    storedHash: draft.embeddingTextHash,
    storedStatus: draft.embeddingStatus,
  });

  if (uitkomst.type === "skipped") return { type: "skipped" };
  if (uitkomst.type === "failed") {
    await payload.update({
      collection: "knowledge-drafts",
      id,
      overrideAccess: true,
      data: { embeddingStatus: "stale" },
    });
    return uitkomst;
  }

  await payload.update({
    collection: "knowledge-drafts",
    id,
    overrideAccess: true,
    data: {
      embeddingStatus: "indexed",
      embeddedAt: new Date().toISOString(),
      embeddingModel: uitkomst.model,
      embeddingTextHash: uitkomst.hash,
      embedding: uitkomst.embedding,
    },
  });
  return { type: "embedded" };
}

export async function embedArticle(payload: Payload, id: number): Promise<ProcesUitkomst> {
  const artikel = await payload.findByID({ collection: "articles", id, overrideAccess: true, depth: 1 });

  if (artikel.articleStatus !== "gepubliceerd") {
    return { type: "ignored", reden: "Alleen gepubliceerde artikelen worden geëmbed." };
  }
  if (artikel.knowledgeType === "pedagogisch" && artikel.aiApprovalStatus !== "goedgekeurd") {
    return {
      type: "ignored",
      reden:
        "Pedagogische content vereist eerst AI-goedkeuring (aiApprovalStatus) — zie docs/CONTENT-MODEL.md §Twee soorten kennis.",
    };
  }

  const categoryTitle =
    typeof artikel.category === "object" && artikel.category !== null
      ? (artikel.category.title ?? null)
      : null;

  const tekst = buildArticleText({
    title: artikel.title,
    summary: artikel.summary,
    tags: artikel.tags,
    categoryTitle,
  });
  const uitkomst = await embedIfChanged({
    text: tekst,
    storedHash: artikel.embeddingTextHash,
    storedStatus: artikel.embeddingStatus,
  });

  if (uitkomst.type === "skipped") return { type: "skipped" };
  if (uitkomst.type === "failed") {
    await payload.update({
      collection: "articles",
      id,
      overrideAccess: true,
      data: { embeddingStatus: "stale" },
    });
    return uitkomst;
  }

  await payload.update({
    collection: "articles",
    id,
    overrideAccess: true,
    data: {
      embeddingStatus: "indexed",
      embeddedAt: new Date().toISOString(),
      embeddingModel: uitkomst.model,
      embeddingTextHash: uitkomst.hash,
      embedding: uitkomst.embedding,
    },
  });
  return { type: "embedded" };
}

type Stap = NonNullable<Handleidingen["stappen"]>[number];

// Handleidingbouwer: zelfde patroon als embedKnowledgeSource (bron +
// hoofdstukken), maar dan handleiding + stappen. Alleen gepubliceerde
// handleidingen worden geëmbed (zelfde "hard-in-code"-poort als
// embedArticle) — retrieval (lib/embeddings/similarity-search.ts) filtert
// hier BOVENOP nogmaals op status, dit is verdediging in diepte. Een
// verborgen stap wordt WEL gewoon geëmbed (zodat verbergen/tonen instant
// werkt zonder herembedden) — verzamelKandidaten() sluit 'm bij retrieval
// uit, niet deze functie.
// LET OP: req wordt hier bewust doorgegeven aan elke findByID/update-
// aanroep. Deze functie wordt aangeroepen VANUIT de afterChange-hook van
// hetzelfde document (Handleidingen.ts) — zonder req openen findByID/update
// een NIEUWE transactie die op de rij-lock van de nog-open buitenste
// transactie wacht en oneindig hangt (ontdekt tijdens live E2E-verificatie:
// de publicatie-hook liep vast op de update()-aanroep hieronder, exact het
// deadlock-patroon dat elders in dit project al bekend was en daar wél
// consequent met req voorkomen werd).
export async function embedHandleiding(
  payload: Payload,
  id: number,
  req?: Partial<PayloadRequest>
): Promise<ProcesUitkomst> {
  const handleiding = await payload.findByID({
    collection: "handleidingen",
    id,
    overrideAccess: true,
    depth: 0,
    req,
  });

  if (handleiding.status !== "gepubliceerd") {
    return { type: "ignored", reden: "Alleen gepubliceerde handleidingen worden geëmbed." };
  }

  const stappen = ((handleiding.stappen ?? []) as Stap[]).slice();
  let stapFout: string | null = null;
  for (let i = 0; i < stappen.length; i += 1) {
    const stap = stappen[i]!;
    const uitkomst = await embedIfChanged({
      text: buildStapText(stap),
      storedHash: stap.embeddingTextHash,
      storedStatus: stap.embedding ? "indexed" : undefined,
    });
    if (uitkomst.type === "embedded") {
      stappen[i] = { ...stap, embedding: uitkomst.embedding, embeddingTextHash: uitkomst.hash };
    } else if (uitkomst.type === "failed") {
      stapFout = `stap "${stap.titel}": ${uitkomst.foutmelding}`;
    }
  }

  const tekst = buildHandleidingText({
    titel: handleiding.titel,
    korteOmschrijving: handleiding.korteOmschrijving,
    zoekwoorden: handleiding.zoekwoorden,
  });
  const uitkomst = await embedIfChanged({
    text: tekst,
    storedHash: handleiding.embeddingTextHash,
    storedStatus: handleiding.embeddingStatus,
  });

  if (uitkomst.type === "failed") {
    await payload.update({
      collection: "handleidingen",
      id,
      overrideAccess: true,
      data: { embeddingStatus: "stale", stappen },
      req,
    });
    return {
      type: "failed",
      foutmelding: stapFout ? `${uitkomst.foutmelding}; ${stapFout}` : uitkomst.foutmelding,
    };
  }

  if (
    uitkomst.type === "skipped" &&
    stappen.every((s, i) => s === (handleiding.stappen as Stap[] | undefined)?.[i])
  ) {
    return stapFout ? { type: "failed", foutmelding: stapFout } : { type: "skipped" };
  }

  await payload.update({
    collection: "handleidingen",
    id,
    overrideAccess: true,
    data: {
      embeddingStatus: stapFout ? "stale" : "indexed",
      embeddedAt: new Date().toISOString(),
      embeddingModel: uitkomst.type === "embedded" ? uitkomst.model : handleiding.embeddingModel,
      embeddingTextHash: uitkomst.type === "embedded" ? uitkomst.hash : handleiding.embeddingTextHash,
      embedding: uitkomst.type === "embedded" ? uitkomst.embedding : handleiding.embedding,
      stappen,
    },
    req,
  });

  return stapFout ? { type: "failed", foutmelding: stapFout } : { type: "embedded" };
}
