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
// (ruwe inhoud → samenvatting/trefwoorden/categorie/hoofdstukken). Nog geen
// vectoropslag: `embeddingStatus`/`embeddingUpdatedAt` zijn puur
// voorbereidende, ongebruikte velden voor een latere pgvector-koppeling (zie
// docs/AI-KNOWLEDGE-STRATEGY.md §Vectoropslag) — er wordt in deze sprint
// nergens naar geschreven.
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
      // opnieuw, zie lib/knowledge/run-indexing.ts.
      listMenuItems: ["@/payload/components/IndexSelectedSourcesButton#IndexSelectedSourcesButton"],
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
          "Voorbereiding voor een latere pgvector-koppeling (docs/AI-KNOWLEDGE-STRATEGY.md) — LET OP: dit is iets anders dan het veld 'Status' hierboven (dat gaat over AI-samenvatting, niet over vector-embeddings). In deze sprint wordt hier nergens naar geschreven; blijft op 'In afwachting' staan.",
      },
    },
    {
      name: "embeddingUpdatedAt",
      type: "date",
      label: "Embedding bijgewerkt op",
      admin: { readOnly: true, description: "Ongebruikt totdat de vectoropslag wordt gebouwd." },
    },
  ],
};
