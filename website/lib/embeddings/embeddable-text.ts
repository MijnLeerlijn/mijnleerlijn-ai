import { convertLexicalToPlaintext } from "@payloadcms/richtext-lexical/plaintext";
import type { SerializedEditorState } from "lexical";

// Bouwt de canonieke tekst die geëmbed (en gehasht) wordt per documenttype —
// bewust hier gecentraliseerd zodat embedden en hashen altijd exact dezelfde
// tekst gebruiken (zie lib/embeddings/process-embedding.ts). Puur, geen
// Payload-afhankelijkheid (geen payload.find/db-aanroepen), dus makkelijk
// los te testen — convertLexicalToPlaintext hieronder is een zuivere
// JSON-naar-tekst-omzetting, geen live Payload-instantie nodig.

export interface KnowledgeSourceVoorEmbedding {
  title: string;
  aiSummary?: string | null;
  aiKeywords?: string[] | null;
  aiCategory?: string | null;
}

export function buildKnowledgeSourceText(bron: KnowledgeSourceVoorEmbedding): string {
  return [bron.title, bron.aiSummary, bron.aiCategory, (bron.aiKeywords ?? []).join(", ")]
    .filter((deel) => deel && deel.trim().length > 0)
    .join("\n\n");
}

export interface ChapterVoorEmbedding {
  title: string;
  summary: string;
}

export function buildChapterText(hoofdstuk: ChapterVoorEmbedding): string {
  return `${hoofdstuk.title}\n\n${hoofdstuk.summary}`;
}

export interface KnowledgeDraftVoorEmbedding {
  title: string;
  question?: string | null;
  shortAnswer?: string | null;
  fullAnswer?: string | null;
  category?: string | null;
  keywords?: string[] | null;
}

export function buildKnowledgeDraftText(draft: KnowledgeDraftVoorEmbedding): string {
  return [
    draft.title,
    draft.question,
    draft.shortAnswer,
    draft.fullAnswer,
    draft.category,
    (draft.keywords ?? []).join(", "),
  ]
    .filter((deel) => deel && deel.trim().length > 0)
    .join("\n\n");
}

export interface ArticleVoorEmbedding {
  title: string;
  summary?: string | null;
  tags?: string[] | null;
  categoryTitle?: string | null;
}

export function buildArticleText(artikel: ArticleVoorEmbedding): string {
  return [artikel.title, artikel.summary, artikel.categoryTitle, (artikel.tags ?? []).join(", ")]
    .filter((deel) => deel && deel.trim().length > 0)
    .join("\n\n");
}

/**
 * Zet een Lexical richText-waarde (bv. Handleidingen.stappen[].uitleg) om
 * naar schone platte tekst voor embeddings — de opmaak zelf (vet/lijst/link)
 * is voor de AI niet relevant, alleen de inhoud. Lege/ontbrekende waarde
 * geeft een lege string, geen fout.
 */
export function richTextNaarPlatteTekst(waarde: unknown): string {
  if (!waarde || typeof waarde !== "object") return "";
  try {
    return convertLexicalToPlaintext({ data: waarde as SerializedEditorState }).trim();
  } catch {
    return "";
  }
}

export interface HandleidingVoorEmbedding {
  titel: string;
  korteOmschrijving?: string | null;
  zoekwoorden?: string[] | null;
}

export function buildHandleidingText(handleiding: HandleidingVoorEmbedding): string {
  return [handleiding.titel, handleiding.korteOmschrijving, (handleiding.zoekwoorden ?? []).join(", ")]
    .filter((deel) => deel && deel.trim().length > 0)
    .join("\n\n");
}

export interface StapVoorEmbedding {
  titel: string;
  uitleg: unknown;
  knopOfSchermnaam?: string | null;
  zoekwoorden?: string[] | null;
}

// Bewust GEEN interneNotitie hier — die mag nooit in AI-tekst terechtkomen.
export function buildStapText(stap: StapVoorEmbedding): string {
  return [
    stap.titel,
    richTextNaarPlatteTekst(stap.uitleg),
    stap.knopOfSchermnaam,
    (stap.zoekwoorden ?? []).join(", "),
  ]
    .filter((deel) => deel && deel.trim().length > 0)
    .join("\n\n");
}
