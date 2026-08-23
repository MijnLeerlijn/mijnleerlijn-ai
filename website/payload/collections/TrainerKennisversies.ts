import type { CollectionConfig } from "payload";
import { adminFieldOnly, adminOnly, anyEditor } from "../access/roles";
import { generateEmbedding } from "@/services/ai-client";

// Traineromgeving V2, Vervolgronde (2026-08-22) — "Kennis" fase 1: de
// trainerversie van een bestaand centraal kennisartikel. Zelfde patroon als
// DerivedContent.ts ("Maak hiervan" — sourceArticle + status concept/
// gepubliceerd + generatedByAi), niet toevallig: het is dezelfde vorm
// (bron -> AI herschrijft voor een ander publiek -> beheerder controleert/
// bewerkt -> publiceert), nu voor het trainerspubliek i.p.v. een
// marketingkanaal. Bewust GEEN VariantOverride-concept hier — een
// trainerversie is nooit per white-label-variant, dus de centrale
// samenvoegfunctie (lib/content/merge.ts) is hier niet van toepassing.
//
// Toegang: zelfde als DerivedContent — anyEditor mag zelf aanmaken/bewerken
// in de Payload-admin (de beheerflow IS de admin-UI, geen publieke/trainer-
// aanroep die create/update nodig heeft). Trainers krijgen NOOIT rechtstreekse
// toegang tot deze collectie — uitsluitend via lib/trainers/kennis.ts, met
// overrideAccess:true en een harde status:"gepubliceerd"-filter, zelfde
// rechtenpatroon als de rest van de traineromgeving.
//
// Kennisbasis-basiskennis (2026-08-23) — `bron` is bewust POLYMORF
// (`articles` én `knowledge-sources`, niet alleen `sourceArticle` →
// `articles` zoals eerst): de centrale Kennisbasis (/admin/kennisbasis,
// KennisbasisView.tsx) is GEEN `articles`-record maar een gewone
// `knowledge-sources`-rij met bronrol "background-model" (zie
// lib/assistant/kennisbasis-context.ts) — dus dezelfde vorm als
// KennisbasisOnderwerpen.gekoppeldeHandleidingen hieronder gespiegeld
// (`relationTo: ["handleidingen","knowledge-sources"]`), i.p.v. een tweede,
// parallelle "kennisbasis-trainerversie"-collectie te bouwen. Eén brontype
// (kennisartikel of kennisbasisdocument) per record — nooit beide.
export const TrainerKennisversies: CollectionConfig = {
  slug: "trainer-kennisversies",
  admin: {
    useAsTitle: "titel",
    defaultColumns: ["titel", "bron", "status", "updatedAt"],
    group: "Trainers",
    description: "Trainerversies van kennisartikelen — AI-concept, door een beheerder gecontroleerd/bewerkt, pas zichtbaar voor trainers na 'Publiceren voor trainers'.",
  },
  access: {
    read: anyEditor,
    create: anyEditor,
    update: anyEditor,
    delete: adminOnly,
  },
  hooks: {
    beforeChange: [
      // Zelfde-collectie-eigen, bewust NIET de gedeelde run-embedding.ts-
      // orchestrator (die bedient de centrale kennisindex — koppelen zou het
      // isolatievereiste ondermijnen: "trainerkennis krijgt een eigen route/
      // retrievalflow"). Herembedt alleen wanneer titel/tekst daadwerkelijk
      // wijzigen (hash-vergelijking, zelfde idee als embedIfChanged elders)
      // én de resulterende status "gepubliceerd" is — een concept hoeft nooit
      // een embedding te hebben, dat bespaart onnodige AI-aanroepen tijdens
      // het schrijven/bewerken vóór publicatie.
      async ({ data, originalDoc }) => {
        if (!data || data.status !== "gepubliceerd") return data;

        // publishedAt = eerste publicatiemoment, nooit overschreven door een
        // latere bewerking van een al-gepubliceerde versie (zelfde idee als
        // "publishedAt" elders in dit project — een moment, geen laatst-
        // bewerkt-tijdstip; updatedAt dekt dat laatste al).
        if (!originalDoc?.publishedAt) {
          data.publishedAt = new Date().toISOString();
        }

        const titel = data.titel ?? originalDoc?.titel ?? "";
        const tekst = data.tekst ?? originalDoc?.tekst ?? "";
        const brontekst = `${titel}\n\n${tekst}`.trim();
        if (!brontekst) return data;

        const hash = await sha256Hex(brontekst);
        if (hash === (data.embeddingTextHash ?? originalDoc?.embeddingTextHash) && (data.embedding ?? originalDoc?.embedding)) {
          return data;
        }
        try {
          data.embedding = await generateEmbedding(brontekst);
          data.embeddingTextHash = hash;
          data.embeddingStatus = "indexed";
        } catch (error) {
          // Best-effort: een mislukte embedding mag opslaan van de
          // trainerversie zelf nooit blokkeren — de beheerder kan gewoon
          // publiceren, alleen de Q&A-vindbaarheid is dan tijdelijk lager
          // (de tekst zelf blijft altijd gewoon leesbaar op /kennis).
          console.error("[trainer-kennisversies] embedding mislukt (opslaan gaat door):", error);
          data.embeddingStatus = "pending";
        }
        return data;
      },
    ],
  },
  fields: [
    {
      name: "bron",
      type: "relationship",
      relationTo: ["articles", "knowledge-sources"],
      required: true,
      label: "Bron",
      admin: { description: "Het kennisartikel of de Kennisbasis waar deze trainerversie 1-op-1 haar feiten vandaan haalt." },
    },
    { name: "titel", type: "text", required: true, label: "Titel (trainerperspectief)" },
    {
      name: "tekst",
      type: "textarea",
      required: true,
      label: "Tekst (trainerperspectief)",
      admin: { description: "Dezelfde feiten als het bronartikel, geschreven vanuit trainersperspectief. Platte tekst — geen HTML/markdown, wordt als gewone tekst getoond." },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "concept",
      label: "Status",
      admin: { position: "sidebar" },
      options: [
        { label: "Concept", value: "concept" },
        { label: "Gepubliceerd (zichtbaar voor trainers)", value: "gepubliceerd" },
      ],
    },
    { name: "publishedAt", type: "date", label: "Gepubliceerd op", admin: { position: "sidebar", readOnly: true } },
    {
      name: "generatedByAi",
      type: "checkbox",
      defaultValue: false,
      label: "AI-gegenereerd",
      access: { update: adminFieldOnly },
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "embeddingStatus",
      type: "select",
      defaultValue: "pending",
      label: "Embedding-status",
      options: [
        { label: "Nog niet", value: "pending" },
        { label: "Geïndexeerd", value: "indexed" },
      ],
      admin: { position: "sidebar", readOnly: true, description: "Alleen relevant voor de trainer-Q&A-zoekfunctie, geen effect op zichtbaarheid van de tekst zelf." },
    },
    { name: "embeddingTextHash", type: "text", admin: { hidden: true } },
    {
      name: "embedding",
      type: "json",
      admin: { readOnly: true, hidden: true, description: "Ruwe vectoropslag voor de trainer-Q&A-zoekfunctie (lib/trainers/kennis.ts) — losstaand van de centrale kennisindex." },
    },
  ],
};

async function sha256Hex(tekst: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(tekst).digest("hex");
}
