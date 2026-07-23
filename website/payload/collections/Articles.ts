import type { CollectionConfig } from "payload";
import { adminFieldOnly, adminOnly, centralEditorOnly, publishedOrEditor } from "../access/roles";
import { contentBlocks } from "../blocks";

// De centrale artikelboom — zie docs/DATA-MODEL.md §Article/§Section/
// §ContentBlock. Section/ContentBlock zijn hier bewust GEEN eigen
// collections maar een genest `sections`-array met een `blocks`-veld erin,
// exact zoals de "Mapping naar Payload-collecties" in DATA-MODEL.md al
// aangeeft. Alleen de centrale redacteur (of admin) mag hier schrijven — een
// variant-redacteur heeft hier letterlijk geen schrijfpad naartoe, zie
// docs/CONTENT-MODEL.md §Wie mag wat schrijven.
export const Articles: CollectionConfig = {
  slug: "articles",
  admin: {
    useAsTitle: "title",
    defaultColumns: [
      "title",
      "category",
      "articleStatus",
      "knowledgeType",
      "aiApprovalStatus",
      "lastContentUpdate",
    ],
    group: "Content",
    description: "De centrale, enige-bron-van-waarheid handleidingen. Nooit per variant gekopieerd.",
    components: {
      listMenuItems: ["@/payload/components/MaakEmbeddingsButton#MaakEmbeddingsButton"],
    },
  },
  access: {
    read: publishedOrEditor,
    create: centralEditorOnly,
    update: centralEditorOnly,
    delete: adminOnly,
  },
  versions: {
    drafts: { autosave: { interval: 2000 }, schedulePublish: true },
    maxPerDoc: 50,
  },
  fields: [
    { name: "title", type: "text", required: true, label: "Titel" },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      label: "Slug",
      admin: { position: "sidebar" },
    },
    { name: "summary", type: "textarea", required: true, label: "Korte samenvatting" },
    {
      name: "category",
      type: "relationship",
      relationTo: "categories",
      required: true,
      label: "Categorie",
      admin: { position: "sidebar" },
    },
    { name: "tags", type: "text", hasMany: true, label: "Tags" },
    {
      name: "variantContext",
      type: "relationship",
      relationTo: "variants",
      hasMany: true,
      label: "Variantcontext",
      admin: {
        position: "sidebar",
        description:
          "Leeg = relevant voor alle varianten (standaard). Ingevuld = dit centrale artikel is uitsluitend zichtbaar binnen deze variant(en) — geen kopie, alleen een zichtbaarheidsbeperking.",
      },
    },
    {
      name: "knowledgeType",
      type: "select",
      required: true,
      defaultValue: "product",
      label: "Kennistype",
      admin: { position: "sidebar" },
      options: [
        { label: "Product/software", value: "product" },
        { label: "Pedagogisch/onderwijskundig", value: "pedagogisch" },
      ],
    },
    {
      // Bewust NIET "status" genoemd: Payload's eigen versions/drafts-systeem
      // (versions.drafts hieronder) claimt intern het veld `_status`
      // (draft/published) — bij collections met versions aan botst de
      // Postgres-enumnaam die Drizzle daarvoor genereert met een eigen veld
      // dat toevallig ook "status" heet (beide worden `enum_articles_status`,
      // met de foutmelding "invalid input value for enum enum_articles_status:
      // 'concept'" tot gevolg). Ontdekt tijdens Fase 4B live-verificatie tegen
      // een echte Postgres-database — zie het opleveringsrapport.
      name: "articleStatus",
      type: "select",
      required: true,
      defaultValue: "concept",
      label: "Redactionele status",
      admin: { position: "sidebar" },
      options: [
        { label: "Concept", value: "concept" },
        { label: "In review", value: "in_review" },
        { label: "Gepland", value: "gepland" },
        { label: "Gepubliceerd", value: "gepubliceerd" },
        { label: "Gearchiveerd", value: "gearchiveerd" },
      ],
    },
    {
      name: "aiApprovalStatus",
      type: "select",
      required: true,
      defaultValue: "n.v.t.",
      label: "AI-goedkeuring",
      access: { update: adminFieldOnly },
      admin: {
        position: "sidebar",
        description:
          "Verplicht 'Goedgekeurd' voordat pedagogische content in de AI-index mag — uitsluitend door een beheerder te zetten. Zie docs/CONTENT-MODEL.md §Twee soorten kennis.",
      },
      options: [
        { label: "N.v.t.", value: "n.v.t." },
        { label: "In afwachting", value: "in_afwachting" },
        { label: "Goedgekeurd", value: "goedgekeurd" },
      ],
    },
    {
      // Sprint 4: dit veld bestond al als voorbereidend Fase 6-systeemveld en
      // wordt nu daadwerkelijk gevuld door lib/embeddings/ (POST
      // /api/knowledge/embed) — alleen voor gepubliceerde artikelen, en voor
      // knowledgeType "pedagogisch" pas ná aiApprovalStatus "goedgekeurd",
      // zie docs/CONTENT-MODEL.md §Twee soorten kennis. embeddedAt/
      // embeddingModel/embeddingTextHash/embedding zijn de bijbehorende
      // velden, zelfde betekenis als op KnowledgeSources/KnowledgeDrafts.
      name: "embeddingStatus",
      type: "select",
      required: true,
      defaultValue: "pending",
      label: "Indexeerstatus (AI)",
      access: { update: adminFieldOnly },
      admin: {
        position: "sidebar",
        readOnly: true,
      },
      options: [
        { label: "In wachtrij", value: "pending" },
        { label: "Geïndexeerd", value: "indexed" },
        { label: "Verouderd", value: "stale" },
      ],
    },
    {
      name: "embeddedAt",
      type: "date",
      label: "Geëmbed op",
      access: { update: adminFieldOnly },
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "embeddingModel",
      type: "text",
      label: "Embedding-model",
      access: { update: adminFieldOnly },
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "embeddingTextHash",
      type: "text",
      label: "Hash van geëmbede tekst",
      access: { update: adminFieldOnly },
      admin: { readOnly: true, hidden: true },
    },
    {
      name: "embedding",
      type: "json",
      label: "Embedding-vector (tijdelijk)",
      access: { update: adminFieldOnly },
      admin: {
        readOnly: true,
        hidden: true,
        description: "Tijdelijke ruwe vectoropslag — zie payload/collections/KnowledgeSources.ts.",
      },
    },
    { name: "publishedAt", type: "date", label: "Publicatiedatum", admin: { position: "sidebar" } },
    {
      name: "lastContentUpdate",
      type: "date",
      required: true,
      label: "Laatste inhoudelijke controle",
      admin: {
        position: "sidebar",
        description: "Datum van laatste inhoudelijke wijziging — verplicht getoond bij bronvermelding.",
      },
    },
    {
      name: "author",
      type: "relationship",
      relationTo: "users",
      label: "Auteur",
      access: { update: () => false },
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "sources",
      type: "relationship",
      relationTo: "sources",
      hasMany: true,
      label: "Bronnen",
    },
    {
      name: "relatedArticles",
      type: "relationship",
      relationTo: "articles",
      hasMany: true,
      label: "Gerelateerde artikelen",
    },
    {
      name: "sections",
      type: "array",
      label: "Secties",
      labels: { singular: "Sectie", plural: "Secties" },
      required: true,
      minRows: 1,
      fields: [
        { name: "title", type: "text", required: true, label: "Sectietitel" },
        { name: "blocks", type: "blocks", label: "Inhoud", blocks: contentBlocks },
      ],
    },
    {
      type: "collapsible",
      label: "SEO",
      admin: { position: "sidebar" },
      fields: [
        { name: "metaTitle", type: "text", label: "SEO-titel" },
        { name: "metaDescription", type: "textarea", label: "SEO-omschrijving" },
      ],
    },
  ],
  hooks: {
    beforeChange: [
      ({ operation, data, req }) => {
        if (operation === "create" && req.user && !data.author) data.author = req.user.id;
        if (!data.lastContentUpdate) data.lastContentUpdate = new Date().toISOString();
        if (data.articleStatus === "gepubliceerd" && !data.publishedAt)
          data.publishedAt = new Date().toISOString();
        return data;
      },
    ],
  },
};
