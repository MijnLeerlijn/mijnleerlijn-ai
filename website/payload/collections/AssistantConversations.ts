import type { CollectionConfig } from "payload";
import { adminOnly, isAdmin, type AuthUser } from "../access/roles";

// Logboek van elke vraag/antwoord-uitwisseling met de AI-assistent
// (Sprint 5, /assistant) — zie lib/assistant/process-question.ts (de enige
// plek die dit aanmaakt) en app/api/assistant/feedback/route.ts (de enige
// plek die feedbackRating/feedbackMissing bijwerkt). Bewust volledig
// dichtgetimmerd zoals payload/collections/AnswerFeedback.ts/
// ContactSubmissions.ts: create/update staan hier dicht voor de normale API,
// zodat alles uitsluitend via de eigen, gecontroleerde routes loopt
// (overrideAccess: true) — nooit rechtstreeks via de Payload-REST-/
// GraphQL-API.
//
// Lezen: een beheerder ziet alles; een redacteur ziet uitsluitend de eigen
// gesprekken (voor de "gesprekken"-zijbalk op /assistant) — zelfde patroon
// als payload/collections/Users.ts se eigen read-access.
export const AssistantConversations: CollectionConfig = {
  slug: "assistant-conversations",
  admin: {
    useAsTitle: "question",
    defaultColumns: ["question", "hasAnswer", "confidence", "user", "createdAt"],
    group: "Beheer",
    description: "Logboek van vraag/antwoord-uitwisselingen met de AI-assistent (/assistant).",
  },
  access: {
    read: ({ req }) => {
      const user = req.user as AuthUser | null;
      if (isAdmin(user)) return true;
      if (!user) return false;
      return { user: { equals: user.id } };
    },
    create: () => false,
    update: () => false,
    delete: adminOnly,
  },
  fields: [
    { name: "question", type: "textarea", required: true, label: "Vraag" },
    {
      name: "hasAnswer",
      type: "checkbox",
      required: true,
      defaultValue: false,
      label: "Antwoord gegeven",
      admin: {
        readOnly: true,
        description: "False = 'Dat weet ik niet' — te weinig/geen betrouwbare bron gevonden.",
      },
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
      admin: {
        readOnly: true,
        description: "Retrieval-score van de beste bron — geen zelfinschatting van het model.",
      },
    },
    {
      name: "sources",
      type: "array",
      label: "Bronnen",
      labels: { singular: "Bron", plural: "Bronnen" },
      admin: { readOnly: true },
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
    { name: "inputTokens", type: "number", label: "Input-tokens", admin: { readOnly: true } },
    { name: "outputTokens", type: "number", label: "Output-tokens", admin: { readOnly: true } },
    { name: "totalTokens", type: "number", label: "Totaal tokens", admin: { readOnly: true } },
    { name: "answerTimeMs", type: "number", label: "Antwoordtijd (ms)", admin: { readOnly: true } },
    {
      name: "feedbackRating",
      type: "select",
      required: true,
      defaultValue: "geen",
      label: "Feedback",
      options: [
        { label: "Geen feedback", value: "geen" },
        { label: "👍 Nuttig", value: "nuttig" },
        { label: "👎 Niet nuttig", value: "niet_nuttig" },
      ],
      admin: { readOnly: true },
    },
    {
      name: "feedbackMissing",
      type: "textarea",
      label: "Wat miste er?",
      admin: {
        readOnly: true,
        condition: (_d, siblingData) => siblingData?.feedbackRating === "niet_nuttig",
      },
    },
    {
      name: "user",
      type: "relationship",
      relationTo: "users",
      required: true,
      label: "Gesteld door",
      admin: { readOnly: true },
    },
  ],
};
