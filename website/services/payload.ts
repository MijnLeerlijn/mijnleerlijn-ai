import { getPayload, type Payload } from "payload";
import { convertLexicalToHTML } from "@payloadcms/richtext-lexical/html";
import config from "@/payload.config";
import type { Article, ContentBlock, Section, VariantOverride } from "@/types/content";
import type { Variant } from "@/types/variant";
import { registreerOpgelosteMedia } from "@/lib/data/media";
import type {
  PayloadArticleDoc,
  PayloadCategoryDoc,
  PayloadContentBlockDoc,
  PayloadMediaDoc,
  PayloadSourceDoc,
  PayloadUpdateDoc,
  PayloadVariantDoc,
} from "@/payload/types";

// DE enige plek die Payload's local API aanroept — zie
// docs/PLATFORM-FOUNDATION.md §9. features/ en app/-routes praten hier
// altijd doorheen, nooit rechtstreeks met Payload. Vertaalt Payload-documenten
// naar het canonieke datamodel (types/content.ts, types/variant.ts) zodat de
// rest van de applicatie (componenten, pagina's) niets van Payload afweet.
// Payload's Postgres-adapter gebruikt numerieke (serial) id's voor
// collection-documenten — het canonieke model gebruikt overal string-id's
// (providers-onafhankelijk, zie DATA-MODEL.md), dus elke opzoekfunctie hier
// converteert expliciet (String(...) bij het lezen, Number(...) bij het
// schrijven van een relatie). Bevestigd tegen echt gegenereerde types tijdens
// Fase 4B — zie payload/types.ts.

let cached: Promise<Payload> | null = null;

function getClient(): Promise<Payload> {
  if (!cached) cached = getPayload({ config });
  return cached;
}

// --- Helpers: Payload-document → canoniek model ------------------------

function mediaUrl(media: PayloadMediaDoc | number | null | undefined): string {
  if (!media || typeof media === "number") return "";
  return media.url ?? "";
}

function mediaAlt(media: PayloadMediaDoc | number | null | undefined): string {
  if (!media || typeof media === "number") return "";
  return media.altText ?? media.alt ?? "";
}

function idOf(value: { id: number } | number): string {
  return String(typeof value === "number" ? value : value.id);
}

export function mapBlock(
  doc: PayloadContentBlockDoc,
  order: number,
  stapTeller: { n: number }
): ContentBlock {
  const basis = { id: doc.id, sectionId: "", order };

  switch (doc.blockType) {
    case "tekst":
      return {
        ...basis,
        type: "tekst",
        // Lexical → HTML op de servicegrens, zodat types/content.ts (en dus
        // ArtikelBlok) ongewijzigd blijft: `body` is en blijft een string.
        // Zie het Fase 4-opleveringsrapport voor de motivatie.
        content: { body: convertLexicalToHTML({ data: doc.body as never, disableContainer: true }) },
      };
    case "genummerde_stap":
      stapTeller.n += 1;
      return { ...basis, type: "genummerde_stap", content: { stepNumber: stapTeller.n, body: doc.body } };
    case "afbeelding":
      return {
        ...basis,
        type: "afbeelding",
        content: { mediaId: idOf(doc.media), caption: doc.caption ?? undefined },
      };
    case "waarschuwing":
      return { ...basis, type: "waarschuwing", content: { body: doc.body } };
    case "tip":
      return { ...basis, type: "tip", content: { body: doc.body } };
    case "video":
      return { ...basis, type: "video", content: { url: doc.url, caption: doc.caption ?? undefined } };
    case "download":
      return { ...basis, type: "download", content: { mediaId: idOf(doc.media), label: doc.label } };
    case "contact_doorverwijzing":
      return {
        ...basis,
        type: "contact_doorverwijzing",
        content: { body: doc.body, prefilledSubject: doc.prefilledSubject ?? undefined },
      };
  }
}

export interface ArticleWithContent extends Article {
  categorySlug: string;
  categoryTitle: string;
  sections: (Section & { blocks: ContentBlock[] })[];
}

export function mapArticle(doc: PayloadArticleDoc): ArticleWithContent {
  const category =
    typeof doc.category === "number"
      ? { id: doc.category, slug: String(doc.category), title: String(doc.category) }
      : doc.category;

  const sections = doc.sections.map((sectie, sIndex) => {
    const stapTeller = { n: 0 };
    const blocks = (sectie.blocks ?? []).map((blok, bIndex) => {
      const mapped = mapBlock(blok, bIndex + 1, stapTeller);
      if (blok.blockType === "afbeelding" || blok.blockType === "download") {
        const media = blok.media;
        if (typeof media !== "number") {
          registreerOpgelosteMedia({
            id: String(media.id),
            url: mediaUrl(media),
            altText: mediaAlt(media),
            type: media.mediaType ?? "afbeelding",
          });
        }
      }
      return { ...mapped, sectionId: sectie.id };
    });
    return { id: sectie.id, articleId: String(doc.id), order: sIndex + 1, title: sectie.title, blocks };
  });

  return {
    id: String(doc.id),
    slug: doc.slug,
    title: doc.title,
    summary: doc.summary,
    category: category.slug,
    categorySlug: category.slug,
    categoryTitle: category.title,
    tags: doc.tags ?? [],
    knowledgeType: doc.knowledgeType,
    // Payload-veldnaam is articleStatus (zie payload/collections/Articles.ts);
    // het canonieke model (types/content.ts) blijft gewoon "status" noemen.
    status: doc.articleStatus,
    aiApprovalStatus: doc.aiApprovalStatus,
    currentVersionId: null,
    lastContentUpdate: doc.lastContentUpdate,
    embeddingStatus: doc.embeddingStatus,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    sections,
  };
}

export function mapVariant(doc: PayloadVariantDoc): Variant {
  return {
    id: String(doc.id),
    slug: doc.slug,
    name: doc.name,
    status: doc.status,
    domain: doc.domain as Variant["domain"],
    branding: {
      logoUrl: mediaUrl(doc.branding.logo) || "/brand/logo-kleur.svg",
      accentColor: doc.branding.accentColor,
      productName: doc.branding.productName,
      tagline: doc.branding.tagline,
      isPlaceholder: doc.branding.isPlaceholder,
    },
    educationType: doc.educationType,
    terminologyDictionary: doc.terminologyDictionary ?? [],
    contactEmail: doc.contactEmail ?? undefined,
    createdAt: new Date().toISOString(),
    createdBy: "payload",
  };
}

export interface Categorie {
  id: string;
  slug: string;
  titel: string;
  icoon: string;
  kleur: PayloadCategoryDoc["color"];
  uitleg: string;
}

export function mapCategory(doc: PayloadCategoryDoc): Categorie {
  return {
    id: String(doc.id),
    slug: doc.slug,
    titel: doc.title,
    icoon: doc.icon,
    kleur: doc.color,
    uitleg: doc.description,
  };
}

export interface Bron {
  titel: string;
  type: string;
  url?: string;
  publisher?: string;
  datum?: string;
  betrouwbaarheid: PayloadSourceDoc["reliability"];
}

export function mapSource(doc: PayloadSourceDoc): Bron {
  return {
    titel: doc.title,
    type: doc.type,
    url: doc.url ?? undefined,
    publisher: doc.publisher ?? undefined,
    datum: doc.publishedDate ?? undefined,
    betrouwbaarheid: doc.reliability,
  };
}

export interface UpdateItem {
  titel: string;
  artikelSlug: string;
  categorySlug: string;
  badge: "Nieuw" | "Bijgewerkt";
  datum: string;
}

// --- Publieke opzoekfuncties (gepubliceerde content, zonder auth) ------

export async function getAllVariants(): Promise<Variant[]> {
  const payload = await getClient();
  const result = await payload.find({ collection: "variants", limit: 100, depth: 1, overrideAccess: false });
  return result.docs.map((d) => mapVariant(d as unknown as PayloadVariantDoc));
}

export async function getVariantBySlug(slug: string): Promise<Variant | null> {
  const payload = await getClient();
  const result = await payload.find({
    collection: "variants",
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
    overrideAccess: false,
  });
  const doc = result.docs[0];
  return doc ? mapVariant(doc as unknown as PayloadVariantDoc) : null;
}

export async function getCategories(): Promise<Categorie[]> {
  const payload = await getClient();
  const result = await payload.find({ collection: "categories", limit: 100, overrideAccess: false });
  return result.docs.map((d) => mapCategory(d as unknown as PayloadCategoryDoc));
}

export async function getCategoryBySlug(slug: string): Promise<Categorie | null> {
  const payload = await getClient();
  const result = await payload.find({
    collection: "categories",
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: false,
  });
  const doc = result.docs[0];
  return doc ? mapCategory(doc as unknown as PayloadCategoryDoc) : null;
}

export async function getArticleBySlug(slug: string): Promise<ArticleWithContent | null> {
  const payload = await getClient();
  const result = await payload.find({
    collection: "articles",
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 2,
    overrideAccess: false, // respecteert publishedOrEditor — drafts blijven onzichtbaar voor publiek
  });
  const doc = result.docs[0];
  return doc ? mapArticle(doc as unknown as PayloadArticleDoc) : null;
}

export async function getArticlesByCategory(categorySlug: string): Promise<ArticleWithContent[]> {
  const payload = await getClient();
  const category = await getCategoryBySlug(categorySlug);
  if (!category) return [];
  const result = await payload.find({
    collection: "articles",
    where: { category: { equals: Number(category.id) } },
    limit: 200,
    depth: 2,
    overrideAccess: false,
  });
  return result.docs.map((d) => mapArticle(d as unknown as PayloadArticleDoc));
}

export async function getAllArticles(): Promise<ArticleWithContent[]> {
  const payload = await getClient();
  const result = await payload.find({ collection: "articles", limit: 500, depth: 2, overrideAccess: false });
  return result.docs.map((d) => mapArticle(d as unknown as PayloadArticleDoc));
}

/**
 * Gerelateerd = eerst het artikel se eigen `relatedArticles`-relatie, anders
 * andere artikelen uit dezelfde categorie — zelfde regel als Fase 3
 * (lib/data/index.ts), nu tegen echte data.
 */
export async function getRelatedArticles(
  articleId: string,
  categorySlug: string,
  aantal = 3
): Promise<ArticleWithContent[]> {
  const payload = await getClient();
  const doc = await payload.findByID({
    collection: "articles",
    id: Number(articleId),
    depth: 2,
    overrideAccess: false,
  });
  const explicit = ((doc as unknown as PayloadArticleDoc).relatedArticles ?? [])
    .filter((a): a is PayloadArticleDoc => typeof a !== "number")
    .map(mapArticle);
  if (explicit.length >= aantal) return explicit.slice(0, aantal);

  const rest = (await getArticlesByCategory(categorySlug)).filter(
    (a) => a.id !== articleId && !explicit.some((e) => e.id === a.id)
  );
  return [...explicit, ...rest].slice(0, aantal);
}

export async function getSources(): Promise<Bron[]> {
  const payload = await getClient();
  const result = await payload.find({ collection: "sources", limit: 200, overrideAccess: false });
  return result.docs.map((d) => mapSource(d as unknown as PayloadSourceDoc));
}

export async function getUpdates(): Promise<UpdateItem[]> {
  const payload = await getClient();
  const result = await payload.find({
    collection: "updates",
    limit: 20,
    depth: 2,
    sort: "-date",
    overrideAccess: false,
  });
  return (result.docs as unknown as PayloadUpdateDoc[])
    .filter((d): d is PayloadUpdateDoc & { article: PayloadArticleDoc } => typeof d.article !== "number")
    .map((d) => ({
      titel: d.article.title,
      artikelSlug: d.article.slug,
      categorySlug:
        typeof d.article.category === "number" ? String(d.article.category) : d.article.category.slug,
      badge: d.badge,
      datum: d.date,
    }));
}

// --- Variant-overrides (Fase 5 gebruikt dit in de samenvoegfunctie) ----

export async function getVariantOverrides(articleId: string, variantId: string): Promise<VariantOverride[]> {
  const payload = await getClient();
  const result = await payload.find({
    collection: "variant-overrides",
    where: {
      and: [
        { targetArticle: { equals: Number(articleId) } },
        { variant: { equals: Number(variantId) } },
        { status: { equals: "gepubliceerd" } },
      ],
    },
    limit: 200,
    depth: 0,
    overrideAccess: false,
  });
  return result.docs.map((d) => ({
    id: String(d.id),
    variantId,
    targetType: d.targetType as VariantOverride["targetType"],
    targetId: d.targetId as string,
    action: d.action as VariantOverride["action"],
    payload: d.payload,
    termOverridesApplied: d.termOverridesApplied as boolean,
    status: d.status as VariantOverride["status"],
    createdAt: d.createdAt as string,
    updatedAt: d.updatedAt as string,
    editedBy:
      typeof d.editedBy === "number" ? String(d.editedBy) : String((d.editedBy as { id: number })?.id ?? ""),
  }));
}

// --- Contactformulier ----------------------------------------------------

export interface NieuweContactSubmission {
  teacherName: string;
  schoolName: string;
  email: string;
  requestType: string;
  subject: string;
  problemDescription: string;
  expected?: string;
  actual?: string;
  pageUrl?: string;
  variantSlug?: string;
  helpCenterUrl: string;
  deviceInfo?: string;
  attachments?: {
    storageKey: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: string;
  }[];
}

/**
 * Slaat een contactmelding op via Payload's local API met `overrideAccess:
 * true` — de collection staat `create` bewust dicht voor de publieke API
 * (zie payload/collections/ContactSubmissions.ts), zodat elke inzending
 * verplicht via app/api/contact/route.ts loopt (validatie, honeypot,
 * rate limiting) vóórdat deze functie wordt aangeroepen.
 */
export async function createContactSubmission(input: NieuweContactSubmission): Promise<{ id: string }> {
  const payload = await getClient();
  let variant: number | undefined;
  if (input.variantSlug) {
    const found = await getVariantBySlug(input.variantSlug);
    variant = found ? Number(found.id) : undefined;
  }

  const doc = await payload.create({
    collection: "contact-submissions",
    overrideAccess: true,
    data: {
      teacherName: input.teacherName,
      schoolName: input.schoolName,
      email: input.email,
      requestType: input.requestType,
      subject: input.subject,
      problemDescription: input.problemDescription,
      expected: input.expected,
      actual: input.actual,
      pageUrl: input.pageUrl,
      variant,
      helpCenterUrl: input.helpCenterUrl,
      submittedAt: new Date().toISOString(),
      deviceInfo: input.deviceInfo,
      status: "nieuw",
      attachments: input.attachments ?? [],
    },
  });

  return { id: String(doc.id) };
}

// --- Antwoordfeedback (Ja/Nee onder AI-antwoorden) -----------------------

export interface NieuweAnswerFeedback {
  vraag: string;
  antwoordTekst: string;
  bronArtikelSlugs: string[];
  variantSlug?: string;
  rating: "nuttig" | "niet_nuttig";
  pageUrl?: string;
}

/**
 * Zelfde patroon als createContactSubmission: schrijven gebeurt met
 * `overrideAccess: true` omdat de collection zelf `create` dichthoudt voor de
 * publieke API — uitsluitend app/api/feedback/route.ts (met rate limiting)
 * mag dit aanroepen.
 */
export async function createAnswerFeedback(input: NieuweAnswerFeedback): Promise<{ id: string }> {
  const payload = await getClient();
  let variant: number | undefined;
  if (input.variantSlug) {
    const found = await getVariantBySlug(input.variantSlug);
    variant = found ? Number(found.id) : undefined;
  }

  const doc = await payload.create({
    collection: "answer-feedback",
    overrideAccess: true,
    data: {
      vraag: input.vraag,
      antwoordTekst: input.antwoordTekst,
      bronArtikelSlugs: input.bronArtikelSlugs,
      variant,
      rating: input.rating,
      pageUrl: input.pageUrl,
      createdAt: new Date().toISOString(),
    },
  });

  return { id: String(doc.id) };
}
