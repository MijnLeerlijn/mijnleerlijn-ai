import type { CollectionConfig } from "payload";
import { adminOnly } from "../access/roles";

// Ruwe kennisbronnen (PDF/video/website/release notes/handleidingen/FAQ's/
// interne documenten) die de AI kan uitlezen, samenvatten en koppelen aan
// conceptkennisartikelen — zie lib/knowledge/index-source.ts (de enige plek
// die de AI-velden hieronder schrijft, via app/api/knowledge/index) en
// payload/collections/KnowledgeDrafts.ts (het veld `knowledgeSources` daar
// is de omgekeerde kant van `knowledgeDrafts` hieronder).
//
// Bewust GEEN nieuwe entiteit in docs/DATA-MODEL.md — net als
// payload/collections/Sources.ts (citeerbaar bronmateriaal voor
// artikel-bronvermelding) is dit een aparte, expliciet toegevoegde collectie
// naast het canonieke model, met een ander doel: Sources.ts is redactionele
// citatiemetadata, deze collectie is de INVOER voor de AI-indexeerpijplijn
// (ruwe inhoud → samenvatting/trefwoorden/categorie/hoofdstukken).
//
// Sprint 4 (embeddings): `embedding` slaat TIJDELIJK de ruwe vector zelf op
// (JSON-array, geen pgvector) — zie lib/embeddings/. Zodra een echte
// vectorstore/pgvector-koppeling wordt gebouwd, is dit veld het enige dat
// vervangen hoeft te worden; `embeddingStatus`/`embeddedAt`/`embeddingModel`/
// `embeddingTextHash` blijven ongewijzigd bruikbaar. `embeddingTextHash` is
// een sha256 van de exact geëmbedde tekst — lib/embeddings/process-embedding.ts
// vergelijkt dit bij elke embed-aanroep met de actueel berekende hash om te
// bepalen of een bron al up-to-date is (skip) of opnieuw geëmbed moet worden
// (bv. na een gewijzigde PDF).
//
// Bewust volledig admin-only, zelfde reden als KnowledgeDrafts/SupportThreads:
// dit kan onbeoordeelde, AI-gegenereerde inhoud bevatten. Aanmaken (nieuwe
// bron toevoegen, PDF uploaden) mag wél via de normale admin-UI — dat is
// precies hoe "PDF uploaden"/"URL toevoegen" uit de opdracht werkt, zonder
// een aparte upload-knop nodig te hebben.
export const KnowledgeSources: CollectionConfig = {
  slug: "knowledge-sources",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "type", "status", "aiIndexedAt"],
    group: "Beheer",
    description:
      "Kennisbronnen voor de AI (PDF's, video's, websites, release notes, handleidingen, FAQ's, interne documenten). Toevoegen via 'Create new'; indexeren via de knop hierboven in de lijst.",
    components: {
      // "Indexeer geselecteerde bronnen" — dekt ook herindexeren: een reeds
      // geïndexeerde bron opnieuw selecteren en klikken verwerkt 'm gewoon
      // opnieuw, zie lib/knowledge/run-indexing.ts. "Maak embeddings" is de
      // Sprint 4-tegenhanger (zie lib/embeddings/) — hetzelfde knop-component
      // wordt hergebruikt op knowledge-drafts en articles.
      listMenuItems: [
        "@/payload/components/SyncManualsButton#SyncManualsButton",
        "@/payload/components/IndexSelectedSourcesButton#IndexSelectedSourcesButton",
        "@/payload/components/MaakEmbeddingsButton#MaakEmbeddingsButton",
      ],
    },
  },
  access: {
    read: adminOnly,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    { name: "title", type: "text", required: true, label: "Titel" },
    {
      name: "type",
      type: "select",
      required: true,
      defaultValue: "pdf",
      label: "Type",
      options: [
        { label: "PDF", value: "pdf" },
        { label: "Video", value: "video" },
        { label: "Website", value: "website" },
        { label: "Release notes", value: "release_notes" },
        { label: "Handleiding", value: "handleiding" },
        { label: "FAQ", value: "faq" },
        { label: "Intern document", value: "intern_document" },
      ],
    },
    {
      name: "file",
      type: "upload",
      relationTo: "media",
      label: "Bestand",
      admin: {
        description: "Verplicht voor type PDF — het document dat de AI uitleest.",
        condition: (_d, s) => s?.type === "pdf",
      },
    },
    {
      name: "url",
      type: "text",
      unique: true,
      label: "URL",
      admin: {
        description:
          "Voor alle typen behalve PDF: link naar de video, website, release notes, handleiding, FAQ of het interne document.",
        condition: (_d, s) => s?.type !== "pdf",
      },
    },
    {
      // Sprint 6 (lib/knowledge/sync-manuals.ts, POST /api/knowledge/sync-manuals):
      // repository-relatief pad (t.o.v. de website/-map, bv.
      // "handleidingen/Analyse.pdf") van bronnen die automatisch uit de
      // handleidingen/-map zijn gesynchroniseerd. Uniek zodat herhaald
      // synchroniseren van hetzelfde bestand altijd dezelfde bron bijwerkt
      // (nooit een duplicaat aanmaakt) — leeg/null voor handmatig
      // aangemaakte bronnen (meerdere NULLs zijn toegestaan in een
      // Postgres-unique-index, zelfde patroon als het veld `url` hierboven).
      name: "sourceFilePath",
      type: "text",
      unique: true,
      label: "Bestandspad (repository)",
      admin: {
        readOnly: true,
        description: "Alleen voor automatisch gesynchroniseerde bronnen — zie lib/knowledge/sync-manuals.ts.",
      },
    },
    {
      // Sha256 van de ruwe bestandsinhoud (NIET van de AI-samenvatting —
      // vergelijk embeddingTextHash verderop, dat is iets anders). Bepaalt
      // of een bestand inhoudelijk gewijzigd is (herindexeren nodig) en
      // detecteert content-duplicaten onder een andere bestandsnaam (bv.
      // "Analyse.pdf" vs. "Analyse (1).pdf") — bij een hash-match op een
      // ANDER bestandspad wordt nooit een nieuwe bron aangemaakt.
      name: "sourceFileHash",
      type: "text",
      unique: true,
      label: "Bestandshash (sha256)",
      admin: { readOnly: true, hidden: true },
    },
    { name: "description", type: "textarea", label: "Omschrijving" },
    { name: "tags", type: "text", hasMany: true, label: "Tags" },
    {
      name: "transcript",
      type: "textarea",
      label: "Transcript",
      admin: {
        description:
          "Voor video's: handmatig plakken, of automatisch opgehaald als de video-URL rechtstreeks naar platte tekst/VTT/SRT verwijst (zie lib/knowledge/video.ts). Blijft leeg als ophalen niet eenvoudig mogelijk was.",
        condition: (_d, s) => s?.type === "video",
      },
    },
    {
      name: "chapters",
      type: "array",
      label: "Hoofdstukken",
      labels: { singular: "Hoofdstuk", plural: "Hoofdstukken" },
      admin: {
        readOnly: true,
        description: "Alleen voor PDF's — automatisch herkend en samengevat door de AI.",
      },
      fields: [
        { name: "title", type: "text", required: true, label: "Hoofdstuktitel" },
        { name: "summary", type: "textarea", required: true, label: "Samenvatting" },
        { name: "order", type: "number", required: true, label: "Volgorde" },
        {
          name: "embedding",
          type: "json",
          label: "Hoofdstuk-embedding (tijdelijk)",
          admin: { readOnly: true, hidden: true },
        },
        {
          name: "embeddingTextHash",
          type: "text",
          label: "Hash van geëmbede hoofdstuktekst",
          admin: { readOnly: true, hidden: true },
        },
      ],
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "new",
      label: "Status",
      options: [
        { label: "Nieuw", value: "new" },
        { label: "Bezig met indexeren", value: "indexing" },
        { label: "Geïndexeerd", value: "indexed" },
        { label: "Fout", value: "error" },
      ],
      admin: {
        readOnly: true,
        description: "Wordt uitsluitend gezet door de indexeerroute — nooit handmatig aanpassen.",
      },
    },
    {
      name: "indexError",
      type: "textarea",
      label: "Foutmelding",
      admin: {
        readOnly: true,
        description:
          "Alleen gevuld bij status 'Fout' — technische reden, nooit brontekst of persoonsgegevens.",
      },
    },
    { name: "aiSummary", type: "textarea", label: "AI-samenvatting", admin: { readOnly: true } },
    { name: "aiKeywords", type: "text", hasMany: true, label: "AI-trefwoorden", admin: { readOnly: true } },
    {
      name: "aiCategory",
      type: "text",
      label: "AI-categorie (voorstel)",
      admin: {
        readOnly: true,
        description:
          "Vrije tekst, net als KnowledgeDrafts.category — nog geen koppeling aan de echte taxonomie.",
      },
    },
    { name: "aiModel", type: "text", label: "AI-model", admin: { readOnly: true } },
    { name: "aiIndexedAt", type: "date", label: "Geïndexeerd op", admin: { readOnly: true } },
    {
      name: "knowledgeDrafts",
      type: "relationship",
      relationTo: "knowledge-drafts",
      hasMany: true,
      label: "Gekoppelde conceptkennisartikelen",
      admin: {
        readOnly: true,
        description:
          "Concepten die deze bron als onderbouwing gebruiken — automatisch gekoppeld bij het indexeren.",
      },
    },
    {
      name: "embeddingStatus",
      type: "select",
      required: true,
      defaultValue: "pending",
      label: "Embedding-status",
      options: [
        { label: "In afwachting", value: "pending" },
        { label: "Geïndexeerd (vector)", value: "indexed" },
        { label: "Verouderd", value: "stale" },
      ],
      admin: {
        readOnly: true,
        description:
          "Wordt gezet door POST /api/knowledge/embed (lib/embeddings/process-embedding.ts) — LET OP: dit is iets anders dan het veld 'Status' hierboven (dat gaat over de AI-samenvatting uit Sprint 3, niet over embeddings).",
      },
    },
    { name: "embeddedAt", type: "date", label: "Geëmbed op", admin: { readOnly: true } },
    {
      name: "embeddingModel",
      type: "text",
      label: "Embedding-model",
      admin: { readOnly: true, description: "Bv. text-embedding-3-small — zie services/ai-client.ts." },
    },
    {
      name: "embeddingTextHash",
      type: "text",
      label: "Hash van geëmbede tekst",
      admin: {
        readOnly: true,
        hidden: true,
        description: "Sha256 van titel+samenvatting+trefwoorden+categorie — bepaalt of herembedden nodig is.",
      },
    },
    {
      name: "embedding",
      type: "json",
      label: "Embedding-vector (tijdelijk)",
      admin: {
        readOnly: true,
        hidden: true,
        description:
          "Tijdelijke ruwe vectoropslag (JSON-array) zolang er geen externe vectorstore/pgvector is — zie het commentaar bovenaan dit bestand. Nooit rechtstreeks tonen/bewerken in de admin-UI.",
      },
    },
  ],
};
