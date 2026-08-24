import type { CollectionConfig } from "payload";
import { adminFieldOnly, adminOnly, anyEditor } from "../access/roles";
import { embedInChunksIfChanged } from "@/lib/embeddings/chunked-embed";

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
      // Herembedt alleen wanneer titel/tekst daadwerkelijk wijzigen (hash-
      // vergelijking) én de resulterende status "gepubliceerd" is — een
      // concept hoeft nooit een embedding te hebben, dat bespaart onnodige
      // AI-aanroepen tijdens het schrijven/bewerken vóór publicatie.
      //
      // Productiecontrole, vervolgronde (2026-08-23) — een trainerversie kan
      // een feitbehoudende AI-herschrijving zijn van het Kennisbasis-
      // achtergronddocument (bedoeld als promptcontext voor gpt-4o, zie
      // lib/assistant/kennisbasis-context.ts) en ruimschoots de 8191-
      // tokenlimiet van text-embedding-3-small overschrijden — één
      // ongedeelde embed()-aanroep werd dan door OpenAI met HTTP 400
      // geweigerd. embedInChunksIfChanged (lib/embeddings/chunked-embed.ts)
      // deelt de brontekst zo nodig op in meerdere chunks (lib/embeddings/
      // chunk-text.ts) en embedt elk apart — data.embedding wordt dus
      // number[][] (één vector per chunk), nooit meer één vlakke vector.
      // Bewust een aparte functie van de gedeelde embedIfChanged
      // (lib/embeddings/embed-record.ts, ongewijzigd voor de centrale
      // kennisindex: die embedt altijd al vooraf gestructureerde, kortere
      // tekst per document/hoofdstuk/stap, nooit één ongedeelde lange
      // string). Zelfde functie hergebruikt door de backfill
      // (lib/trainers/kennis-reindex.ts) — één plek voor "moet dit record
      // herembed worden", nooit twee losse implementaties die uit elkaar
      // kunnen lopen.
      //
      // Vervolgronde (2026-08-24) — "hoofdstuknavigatie + bronverwijzing":
      // embedInChunksIfChanged geeft sindsdien ook chunkMeta terug (per
      // chunk: heading/headingSlug/headingLevel/chunkIndex, zie
      // lib/embeddings/chunked-embed.ts) — weggeschreven in het NIEUWE veld
      // embeddingChunks, index-uitgelijnd met embedding. Retrieval
      // (lib/trainers/kennis.ts) gebruikt dit om een antwoord niet alleen
      // naar het hele document, maar naar het exacte hoofdstuk te linken.
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

        const uitkomst = await embedInChunksIfChanged({
          text: brontekst,
          storedHash: (data.embeddingTextHash ?? originalDoc?.embeddingTextHash) as string | null | undefined,
          storedStatus: (data.embeddingStatus ?? originalDoc?.embeddingStatus) as string | null | undefined,
        });
        if (uitkomst.type === "embedded") {
          data.embedding = uitkomst.embeddings;
          data.embeddingChunks = uitkomst.chunkMeta;
          data.embeddingTextHash = uitkomst.hash;
          data.embeddingStatus = "indexed";
        } else if (uitkomst.type === "failed") {
          // Best-effort: een mislukte embedding mag opslaan van de
          // trainerversie zelf nooit blokkeren — de beheerder kan gewoon
          // publiceren, alleen de Q&A-vindbaarheid is dan tijdelijk lager
          // (de tekst zelf blijft altijd gewoon leesbaar op /kennis).
          // Productiecontrole (2026-08-23): dit was voorheen een doodlopend
          // pad — een zo gefaald record bleef voor altijd "gepubliceerd"
          // zonder embedding. lib/trainers/kennis-reindex.ts se
          // herindexeerTrainerKennisversies() vindt en herprobeert precies
          // zulke records (embeddingStatus !== "indexed").
          console.error("[trainer-kennisversies] embedding mislukt (opslaan gaat door):", uitkomst.diagnose);
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
      admin: {
        readOnly: true,
        hidden: true,
        description: "Ruwe vectoropslag voor de trainer-Q&A-zoekfunctie (lib/trainers/kennis.ts) — losstaand van de centrale kennisindex. Eén vector per chunk (number[][], zie lib/embeddings/chunk-text.ts) i.p.v. één vlakke vector: lange trainerkennis wordt vóór het embedden opgedeeld.",
      },
    },
    {
      // Hoofdstuknavigatie + bronverwijzing (2026-08-24) — index-uitgelijnd
      // met `embedding` (embeddingChunks[i] hoort bij embedding[i]), bewust
      // een APART veld i.p.v. in `embedding` gebundeld: retrieval-scoring
      // (besteChunkSimilarity, lib/trainers/kennis.ts) blijft zo op een
      // onveranderd number[][] werken. Kan ontbreken/korter zijn dan
      // `embedding` voor records die vóór deze functionaliteit zijn
      // geïndexeerd — lib/trainers/kennis-reindex.ts herkent zo'n record als
      // "moet opnieuw" en vult dit veld met een herindexering alsnog.
      name: "embeddingChunks",
      type: "json",
      admin: {
        readOnly: true,
        hidden: true,
        description: "Hoofdstuk-metadata per chunk (heading/headingSlug/headingLevel/chunkIndex) — voor 'Bekijk hoofdstuk'-bronverwijzingen. Index-uitgelijnd met embedding.",
      },
    },
  ],
};
