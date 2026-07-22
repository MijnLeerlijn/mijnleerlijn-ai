import type { Article, Section, ContentBlock, KnowledgeType } from "@/types/content";
import { registreerMedia } from "./media";

// Beknopt autering-formaat → canoniek datamodel (types/content.ts). Zie
// docs/DATA-MODEL.md — dit bestand vertaalt alleen naar de canonieke vorm,
// het model zelf verandert hier niet. Bewust zo gebouwd dat Fase 5 deze
// dummydata 1:1 kan vervangen door een Payload-opzoeking met dezelfde vorm.

export type BlokKort =
  | string
  | { stap: string }
  | { waarschuwing: string }
  | { tip: string }
  | { afbeelding: string; bijschrift?: string }
  | { video: string; bijschrift?: string }
  | { download: string; label: string }
  | { contact: string; onderwerp?: string };

export interface SectieKort {
  titel: string;
  blokken: BlokKort[];
}

export interface ArtikelKort {
  slug: string;
  titel: string;
  categorie: string;
  tags?: string[];
  knowledgeType?: KnowledgeType;
  /** ISO-datum (bv. "2026-05-10") — weergave via lib/format/date.ts. */
  laatstBijgewerkt: string;
  secties: SectieKort[];
}

export interface ArticleWithContent extends Article {
  categorySlug: string;
  sections: (Section & { blocks: ContentBlock[] })[];
}

let articleTeller = 0;

function naarBlok(kort: BlokKort, sectionId: string, order: number, stapTeller: { n: number }): ContentBlock {
  const basis = { id: `${sectionId}-blok-${order}`, sectionId, order };

  if (typeof kort === "string") {
    return { ...basis, type: "tekst", content: { body: kort } };
  }
  if ("stap" in kort) {
    stapTeller.n += 1;
    return { ...basis, type: "genummerde_stap", content: { stepNumber: stapTeller.n, body: kort.stap } };
  }
  if ("waarschuwing" in kort) {
    return { ...basis, type: "waarschuwing", content: { body: kort.waarschuwing } };
  }
  if ("tip" in kort) {
    return { ...basis, type: "tip", content: { body: kort.tip } };
  }
  if ("afbeelding" in kort) {
    const media = registreerMedia(kort.afbeelding, "afbeelding");
    return { ...basis, type: "afbeelding", content: { mediaId: media.id, caption: kort.bijschrift } };
  }
  if ("video" in kort) {
    return { ...basis, type: "video", content: { url: kort.video, caption: kort.bijschrift } };
  }
  if ("download" in kort) {
    const media = registreerMedia(kort.label, "download");
    return { ...basis, type: "download", content: { mediaId: media.id, label: kort.label } };
  }
  return {
    ...basis,
    type: "contact_doorverwijzing",
    content: { body: kort.contact, prefilledSubject: kort.onderwerp },
  };
}

export function maakArtikel(input: ArtikelKort): ArticleWithContent {
  articleTeller += 1;
  const articleId = `artikel-${articleTeller}`;
  const knowledgeType = input.knowledgeType ?? "product";

  const sections = input.secties.map((sectie, sIndex) => {
    const sectionId = `${articleId}-sectie-${sIndex + 1}`;
    const stapTeller = { n: 0 };
    const blocks = sectie.blokken.map((blok, bIndex) => naarBlok(blok, sectionId, bIndex + 1, stapTeller));
    return { id: sectionId, articleId, order: sIndex + 1, title: sectie.titel, blocks };
  });

  const eersteTekstblok = sections.flatMap((s) => s.blocks).find((b) => b.type === "tekst");
  const summary =
    eersteTekstblok?.type === "tekst" ? eersteTekstblok.content.body : (sections[0]?.title ?? input.titel);

  return {
    id: articleId,
    slug: input.slug,
    title: input.titel,
    summary,
    category: input.categorie,
    categorySlug: input.categorie,
    tags: input.tags ?? [],
    knowledgeType,
    status: "gepubliceerd",
    aiApprovalStatus: knowledgeType === "pedagogisch" ? "goedgekeurd" : "n.v.t.",
    currentVersionId: null,
    lastContentUpdate: input.laatstBijgewerkt,
    embeddingStatus: "indexed",
    createdAt: input.laatstBijgewerkt,
    updatedAt: input.laatstBijgewerkt,
    sections,
  };
}
