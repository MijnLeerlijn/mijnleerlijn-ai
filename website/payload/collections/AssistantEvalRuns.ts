import type { CollectionConfig } from "payload";
import { adminOnly } from "../access/roles";

// Eén record per keer dat een testvraag (AssistantEvalQuestions) door de
// volledige RAG-pijplijn is gehaald via de chatbot-evaluatieomgeving — zie
// lib/assistant/evaluate.ts (runAssistantEvaluation, de enige plek die dit
// aanmaakt) en payload/globals/AssistantEval.ts (de testpagina). Bewust een
// APARTE collectie van assistant-conversations: dat zijn ECHTE
// gebruikersgesprekken (met een user-koppeling, feedbackRating voor
// eindgebruikers), dit zijn evaluatieruns met veel uitgebreidere diagnostiek
// (herschreven zoekvraag, per-bron similarity/prioriteit/bronrol, de
// volledige contexttekst) én een menselijk-beoordelingsveld — dat samen
// vermengen zou zowel productieanalyse als evaluatieoverzicht vervuilen.
//
// GEEN automatische beoordeling (opdracht: "Voeg geen automatische
// optimalisatie toe. We willen eerst handmatig kunnen beoordelen waar
// fouten ontstaan.") — `verdict`/`opmerkingen` worden UITSLUITEND door een
// beheerder ingevuld, hier bewust NIET readOnly (in tegenstelling tot alle
// overige velden, die uitsluitend door runAssistantEvaluation() geschreven
// worden).
export const AssistantEvalRuns: CollectionConfig = {
  slug: "assistant-eval-runs",
  admin: {
    useAsTitle: "question",
    defaultColumns: ["question", "hasAnswer", "confidence", "verdict", "createdAt"],
    group: "Beheer",
    description:
      "Uitkomsten van chatbot-evaluatieruns (/admin/globals/assistant-eval) — diagnostiek + handmatige beoordeling per testvraag.",
  },
  access: {
    read: adminOnly,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  fields: [
    {
      name: "evalQuestion",
      type: "relationship",
      relationTo: "assistant-eval-questions",
      label: "Testvraag (indien uit de vragenset)",
      admin: { readOnly: true, description: "Leeg bij een losse, handmatig ingevoerde testvraag." },
    },
    {
      name: "question",
      type: "textarea",
      required: true,
      label: "Originele vraag",
      admin: { readOnly: true, description: "Snapshot van de daadwerkelijk gebruikte vraagtekst." },
    },
    {
      name: "rewrittenQuery",
      type: "text",
      required: true,
      label: "Herschreven zoekvraag",
      admin: { readOnly: true, description: "Zie lib/assistant/rewrite-query.ts." },
    },
    {
      name: "retrievalFase",
      type: "text",
      required: true,
      label: "Uitgevoerde retrievalfase",
      admin: {
        readOnly: true,
        description: '"core", "core+secondary" of "core+secondary+reference" — zie searchKnowledgePhased.',
      },
    },
    {
      name: "hits",
      type: "array",
      label: "Gevonden bronnen/chunks",
      labels: { singular: "Treffer", plural: "Treffers" },
      admin: { readOnly: true, description: "Alles wat searchKnowledgePhased teruggaf, vóór antwoordgeneratie." },
      fields: [
        { name: "type", type: "text", required: true, label: "Type" },
        { name: "refId", type: "number", required: true, label: "ID" },
        { name: "title", type: "text", required: true, label: "Titel" },
        { name: "chapterTitle", type: "text", label: "Hoofdstuk" },
        { name: "similarity", type: "number", required: true, label: "Similarity" },
        { name: "priority", type: "text", label: "Prioriteit (Knowledge Source)" },
        { name: "bronrol", type: "text", label: "Bronrol (purpose)" },
      ],
    },
    {
      name: "contextText",
      type: "textarea",
      required: true,
      label: "Uiteindelijke context naar het taalmodel",
      admin: { readOnly: true, description: "Letterlijke prompt-context — zie contextItemsNaarPrompt()." },
    },
    {
      name: "hasAnswer",
      type: "checkbox",
      required: true,
      defaultValue: false,
      label: "Antwoord gegeven",
      admin: { readOnly: true },
    },
    { name: "answer", type: "textarea", required: true, label: "Antwoord", admin: { readOnly: true } },
    { name: "reasoning", type: "textarea", label: "Waarom dit antwoord", admin: { readOnly: true } },
    {
      name: "confidence",
      type: "number",
      required: true,
      min: 0,
      max: 100,
      label: "Confidence (0-100)",
      admin: { readOnly: true },
    },
    {
      name: "sources",
      type: "array",
      label: "Bronvermeldingen (getoond bij het antwoord)",
      labels: { singular: "Bron", plural: "Bronnen" },
      admin: { readOnly: true, description: "Leeg bij 'geen antwoord' — zelfde als in de echte assistent-UI." },
      fields: [
        { name: "label", type: "text", required: true, label: "Type (weergavelabel)" },
        { name: "refCollection", type: "text", required: true, label: "Collectie" },
        { name: "refId", type: "number", required: true, label: "ID" },
        { name: "title", type: "text", required: true, label: "Titel" },
        { name: "chapterTitle", type: "text", label: "Hoofdstuk" },
        { name: "similarity", type: "number", required: true, label: "Similarity" },
        { name: "url", type: "text", required: true, label: "URL" },
      ],
    },
    { name: "model", type: "text", label: "AI-model", admin: { readOnly: true } },
    {
      name: "verdict",
      type: "select",
      defaultValue: "nog_niet_beoordeeld",
      label: "Beoordeling",
      options: [
        { label: "Nog niet beoordeeld", value: "nog_niet_beoordeeld" },
        { label: "Correct", value: "correct" },
        { label: "Gedeeltelijk correct", value: "gedeeltelijk_correct" },
        { label: "Incorrect", value: "incorrect" },
      ],
      admin: {
        description: "Handmatige beoordeling — wordt nooit automatisch bepaald.",
      },
    },
    {
      name: "opmerkingen",
      type: "textarea",
      label: "Opmerkingen",
      admin: { description: "Vrij tekstveld: wat klopte niet, wat ontbrak, waarom deze beoordeling." },
    },
  ],
};
