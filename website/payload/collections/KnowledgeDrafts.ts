import type { CollectionConfig } from "payload";
import { adminOnly } from "../access/roles";

// AI-gegenereerde conceptkennisartikelen — zie lib/support/analyze.ts (de
// enige plek die deze collectie aanmaakt, via app/api/support/analyze).
// Bewust volledig admin-only: dit kan (in de brontekst van sourceThreads)
// nog herleidbare informatie bevatten totdat een beheerder het concept heeft
// beoordeeld, en de AI mag hier nooit zelfstandig iets publiceren — zie
// docs-commentaar in dat analysebestand voor de volledige redenering.
//
// GEEN automatische omzetting naar Articles in deze fase — `status:
// "published"` is uitsluitend boekhouding voor een beheerder ("dit concept
// is inmiddels handmatig verwerkt tot een echt artikel"), er gebeurt
// nergens in code iets automatisch zodra deze waarde gezet wordt.
export const KnowledgeDrafts: CollectionConfig = {
  slug: "knowledge-drafts",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "status", "confidenceScore", "isGeneralKnowledge", "aiAnalyzedAt"],
    group: "Beheer",
    description:
      "AI-conceptkennisartikelen uit Gmail-helpdeskthreads. Aanmaken kan alleen via de synchronisatieroute; hier uitsluitend bekijken, aanpassen, goedkeuren of afkeuren.",
  },
  access: {
    read: adminOnly,
    create: () => false,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    { name: "title", type: "text", required: true, label: "Titel" },
    { name: "question", type: "textarea", required: true, label: "Hoofdvraag" },
    { name: "shortAnswer", type: "textarea", required: true, label: "Kort antwoord" },
    { name: "fullAnswer", type: "textarea", required: true, label: "Volledig antwoord" },
    {
      name: "steps",
      type: "array",
      label: "Stappen",
      labels: { singular: "Stap", plural: "Stappen" },
      fields: [
        { name: "title", type: "text", required: true, label: "Staptitel" },
        { name: "description", type: "textarea", required: true, label: "Stapomschrijving" },
      ],
    },
    { name: "category", type: "text", label: "Categorie (voorstel)" },
    { name: "keywords", type: "text", hasMany: true, label: "Trefwoorden" },
    {
      name: "sourceThreads",
      type: "relationship",
      relationTo: "support-threads",
      hasMany: true,
      label: "Bron-threads",
      admin: { description: "Alle Gmail-threads die tot dit concept hebben bijgedragen." },
    },
    {
      name: "confidenceScore",
      type: "number",
      required: true,
      min: 0,
      max: 100,
      label: "Betrouwbaarheidsscore (0-100)",
    },
    { name: "confidenceExplanation", type: "textarea", label: "Toelichting betrouwbaarheid" },
    {
      name: "isGeneralKnowledge",
      type: "checkbox",
      defaultValue: false,
      label: "Algemeen bruikbaar",
      admin: {
        description: "Is deze kennis nuttig voor andere MijnLeerlijn-gebruikers, niet alleen deze afzender?",
      },
    },
    {
      name: "customerSpecificInformationFound",
      type: "checkbox",
      defaultValue: false,
      label: "Klantspecifieke informatie aangetroffen in bron",
      admin: {
        description:
          "Stond er in de brontekst iets klant-/leerling-/schoolspecifieks? Het concept zelf hoort dat nooit te bevatten (zie fullAnswer/shortAnswer) — dit vinkje is alleen ter waarschuwing bij het beoordelen.",
      },
    },
    {
      name: "customerSpecificInformationExplanation",
      type: "textarea",
      label: "Toelichting klantspecifieke info",
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "new",
      label: "Status",
      options: [
        { label: "Nieuw", value: "new" },
        { label: "Ter beoordeling", value: "review" },
        { label: "Goedgekeurd", value: "approved" },
        { label: "Afgekeurd", value: "rejected" },
        { label: "Gepubliceerd (handmatig verwerkt)", value: "published" },
      ],
    },
    { name: "aiModel", type: "text", label: "AI-model", admin: { readOnly: true } },
    { name: "aiAnalyzedAt", type: "date", label: "Geanalyseerd op", admin: { readOnly: true } },
    {
      name: "reviewNotes",
      type: "textarea",
      label: "Beoordelingsnotities",
      admin: { description: "Vrije notities van de beheerder bij het goed-/afkeuren." },
    },
  ],
};
