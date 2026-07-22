// Interim, handmatig geschreven typen voor Payload-documenten. Bevestigd
// tegen de écht gegenereerde `types/payload-generated.d.ts` tijdens Fase 4B
// (live-verificatie tegen een echte PostgreSQL-database) — met name de
// id-typen zijn toen gecorrigeerd: Payload's Postgres-adapter gebruikt
// standaard numerieke (serial) primary keys voor collections, maar
// string-UUID's voor rijen binnen een genest array-/blocks-veld (secties,
// content-blokken). Alleen de velden die services/payload.ts daadwerkelijk
// leest zijn hier gemodelleerd — geen volledige 1:1 kopie van elk
// Payload-intern veld.

export interface PayloadMediaDoc {
  id: number;
  url?: string | null;
  alt?: string | null;
  altText?: string | null;
  mediaType?: "afbeelding" | "video" | "download";
  filename?: string | null;
  mimeType?: string | null;
}

export interface PayloadVariantDoc {
  id: number;
  name: string;
  slug: string;
  status: "concept" | "actief" | "gearchiveerd";
  educationType: string;
  domain: { type: "custom_domain" | "subdomain" | "slug_path"; value: string; domainStatus: string };
  branding: {
    logo?: PayloadMediaDoc | number | null;
    accentColor: string;
    productName: string;
    tagline: string;
    isPlaceholder: boolean;
  };
  terminologyDictionary?: { centralTerm: string; variantTerm: string }[];
  contactEmail?: string | null;
}

export interface PayloadCategoryDoc {
  id: number;
  title: string;
  slug: string;
  icon: string;
  color: "blauw" | "groen" | "oranje" | "geel" | "rood";
  description: string;
}

export interface PayloadSourceDoc {
  id: number;
  title: string;
  type: string;
  url?: string | null;
  publisher?: string | null;
  publishedDate?: string | null;
  reliability: "hoog" | "gemiddeld" | "laag";
}

// Lexical's serialized editor state — alleen doorgegeven aan de HTML-
// converter, nooit zelf geïnterpreteerd.
export type SerializedLexicalState = unknown;

// Sectie-/blokniveau: rijen binnen een genest array-/blocks-veld krijgen een
// string-UUID als id, niet het numerieke id-type van collections zelf.
export type PayloadContentBlockDoc =
  | { id: string; blockType: "tekst"; body: SerializedLexicalState }
  | { id: string; blockType: "genummerde_stap"; body: string }
  | { id: string; blockType: "afbeelding"; media: PayloadMediaDoc | number; caption?: string | null }
  | { id: string; blockType: "waarschuwing"; body: string }
  | { id: string; blockType: "tip"; body: string }
  | { id: string; blockType: "video"; url: string; caption?: string | null }
  | { id: string; blockType: "download"; media: PayloadMediaDoc | number; label: string }
  | { id: string; blockType: "contact_doorverwijzing"; body: string; prefilledSubject?: string | null };

export interface PayloadSectionDoc {
  id: string;
  title: string;
  blocks?: PayloadContentBlockDoc[] | null;
}

export interface PayloadArticleDoc {
  id: number;
  title: string;
  slug: string;
  summary: string;
  category: PayloadCategoryDoc | number;
  tags?: string[] | null;
  variantContext?: (PayloadVariantDoc | number)[] | null;
  knowledgeType: "product" | "pedagogisch";
  /** Hernoemd van "status": botst anders met Payload's interne _status-veld (versions.drafts), zie payload/collections/Articles.ts. */
  articleStatus: "concept" | "in_review" | "gepland" | "gepubliceerd" | "gearchiveerd";
  aiApprovalStatus: "n.v.t." | "in_afwachting" | "goedgekeurd";
  embeddingStatus: "pending" | "indexed" | "stale";
  publishedAt?: string | null;
  lastContentUpdate: string;
  author?: { id: number; name: string } | number | null;
  sources?: (PayloadSourceDoc | number)[] | null;
  relatedArticles?: (PayloadArticleDoc | number)[] | null;
  sections: PayloadSectionDoc[];
  updatedAt: string;
  createdAt: string;
}

export interface PayloadUpdateDoc {
  id: number;
  article: PayloadArticleDoc | number;
  badge: "Nieuw" | "Bijgewerkt";
  date: string;
}
