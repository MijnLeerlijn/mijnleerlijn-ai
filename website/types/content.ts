// Canoniek datamodel — 1:1 overgenomen uit docs/DATA-MODEL.md (de canonieke bron).
// Wijzig het model altijd eerst daar; dit bestand volgt, niet andersom.

export type ArticleStatus = "concept" | "in_review" | "gepland" | "gepubliceerd" | "gearchiveerd";
export type KnowledgeType = "product" | "pedagogisch";
export type AiApprovalStatus = "n.v.t." | "in_afwachting" | "goedgekeurd";
export type EmbeddingStatus = "pending" | "indexed" | "stale";

export interface Article {
  id: string;
  slug: string;
  title: string;
  /** Korte samenvatting voor lijstweergaven (categorie-overzicht, updates) en SEO. Toegevoegd in Fase 4. */
  summary: string;
  category: string;
  tags: string[];
  knowledgeType: KnowledgeType;
  status: ArticleStatus;
  /** Verplicht "goedgekeurd" voordat knowledgeType "pedagogisch"-content in de AI-index mag. */
  aiApprovalStatus: AiApprovalStatus;
  currentVersionId: string | null;
  lastContentUpdate: string;
  embeddingStatus: EmbeddingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Section {
  id: string;
  articleId: string;
  order: number;
  title: string;
}

export type ContentBlockType =
  | "tekst"
  | "genummerde_stap"
  | "afbeelding"
  | "waarschuwing"
  | "tip"
  | "video"
  | "download"
  | "contact_doorverwijzing";

interface ContentBlockBase {
  id: string;
  sectionId: string;
  order: number;
}

export type ContentBlock =
  | (ContentBlockBase & { type: "tekst"; content: { body: string } })
  | (ContentBlockBase & { type: "genummerde_stap"; content: { stepNumber: number; body: string } })
  | (ContentBlockBase & { type: "afbeelding"; content: { mediaId: string; caption?: string } })
  | (ContentBlockBase & { type: "waarschuwing"; content: { body: string } })
  | (ContentBlockBase & { type: "tip"; content: { body: string } })
  | (ContentBlockBase & { type: "video"; content: { url: string; caption?: string } })
  | (ContentBlockBase & { type: "download"; content: { mediaId: string; label: string } })
  | (ContentBlockBase & {
      type: "contact_doorverwijzing";
      content: { body: string; prefilledSubject?: string };
    });

export interface Media {
  id: string;
  url: string;
  altText: string;
  type: "afbeelding" | "video" | "download";
  articleId?: string;
}

export interface ArticleVersion {
  id: string;
  articleId: string;
  treeSnapshot: unknown;
  editedBy: string;
  editedAt: string;
  changeNote?: string;
  publishedAt: string | null;
}

export type VariantOverrideTargetType = "article" | "section" | "block";

export type VariantOverrideAction =
  "onveranderd" | "aanvullen" | "vervangen" | "verbergen" | "ander_medium" | "invoegen_voor" | "invoegen_na";

export interface VariantOverride {
  id: string;
  variantId: string;
  targetType: VariantOverrideTargetType;
  targetId: string;
  action: VariantOverrideAction;
  payload: unknown;
  termOverridesApplied: boolean;
  status: "concept" | "gepubliceerd";
  createdAt: string;
  updatedAt: string;
  editedBy: string;
}

export interface AuditLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  diffSummary: unknown;
  timestamp: string;
}
