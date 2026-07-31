import type { CollectionConfig } from "payload";
import { adminOnly, isAdmin, type AuthUser } from "../access/roles";

// Logboek van elke vraag/antwoord-uitwisseling met de AI-assistent
// (Sprint 5, /assistant) — zie lib/assistant/process-question.ts (de enige
// plek die dit aanmaakt voor het interne /assistant-scherm) en
// lib/assistant/process-public-question.ts (Helpdesk MVP 1.0: dezelfde
// collectie, nu ook gebruikt door de PUBLIEKE, niet-ingelogde
// helpdesk-homepage, zie app/api/helpdesk/ask/route.ts). Bewust volledig
// dichtgetimmerd zoals payload/collections/AnswerFeedback.ts/
// ContactSubmissions.ts: create/update staan hier dicht voor de normale API,
// zodat alles uitsluitend via de eigen, gecontroleerde routes loopt
// (overrideAccess: true) — nooit rechtstreeks via de Payload-REST-/
// GraphQL-API.
//
// Lezen: een beheerder ziet alles; een redacteur ziet uitsluitend de eigen
// gesprekken (voor de "gesprekken"-zijbalk op /assistant) — zelfde patroon
// als payload/collections/Users.ts se eigen read-access. Een anonieme
// helpdesk-conversatie (user: null) heeft dus GEEN redacteur-eigenaar en is
// uitsluitend voor beheerders zichtbaar — bewust, want er is geen
// ingelogde gebruiker om "eigen gesprek" aan te koppelen.
export const AssistantConversations: CollectionConfig = {
  slug: "assistant-conversations",
  admin: {
    useAsTitle: "question",
    defaultColumns: ["question", "source", "hasAnswer", "confidence", "user", "createdAt"],
    group: "Basis — Technisch beheer",
    description:
      "Logboek van vraag/antwoord-uitwisselingen met de AI-assistent (/assistant én de publieke helpdesk-homepage).",
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
    {
      name: "source",
      type: "select",
      required: true,
      defaultValue: "assistant",
      label: "Herkomst",
      options: [
        { label: "Intern (/assistant)", value: "assistant" },
        { label: "Publieke helpdesk-homepage", value: "helpdesk" },
      ],
      admin: { readOnly: true },
    },
    {
      // Multi-brand variants (2026-07-30): welke variant actief was tijdens
      // dit gesprek — alleen gezet voor `source: "helpdesk"` (de publieke
      // pijplijn, zie process-public-question.ts). Maakt "geen kennislekkage
      // tussen varianten"-steekproefcontroles in het AI Verbetercentrum
      // mogelijk (zie docs/AI-KNOWLEDGE-STRATEGY.md se verplichte
      // variant-lekkage-test). Enkelvoudig, niet hasMany: één gesprek
      // gebeurt binnen precies één actieve variant.
      name: "variant",
      type: "relationship",
      relationTo: "variants",
      label: "Variant",
      admin: { readOnly: true, description: "Alleen gezet bij een publiek Helpdesk-gesprek." },
    },
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
    {
      // Handleidingbouwer: welke stap(pen) daadwerkelijk getoond zijn — apart
      // van `sources` hierboven (dat blijft de generieke citatielijst) omdat
      // dit specifiek de structuur is die een latere analytics-ronde nodig
      // heeft: "welke handleiding/stap is gebruikt" zonder de hele `sources`-
      // array te moeten herinterpreteren. Nog GEEN analytics-verwerking hier
      // — puur alvast opslaan, zie het gesprek "Handleidingbouwer".
      name: "steps",
      type: "array",
      label: "Getoonde stappen",
      labels: { singular: "Stap", plural: "Stappen" },
      admin: { readOnly: true },
      fields: [
        { name: "handleidingId", type: "number", required: true, label: "Handleiding-ID" },
        { name: "stepId", type: "text", required: true, label: "Stap-ID" },
        { name: "stepNummer", type: "number", required: true, label: "Stapnummer" },
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
      label: "Gesteld door",
      admin: {
        readOnly: true,
        description: "Leeg bij een anonieme vraag via de publieke helpdesk-homepage (source: 'helpdesk').",
      },
    },
    // AI Verbetercentrum (2026-07-27): onderstaande velden leggen de
    // uitkomst van lib/assistant/bepaal-intentie.ts vast — die ging tot nu
    // toe volledig verloren zodra de functie return deed. Allemaal
    // readOnly: schrijven gebeurt uitsluitend via de eigen
    // app/api/verbetercentrum/*-routes (overrideAccess: true), nooit via dit
    // standaard admin-formulier — zelfde reden als bij `feedbackRating`
    // hierboven (de collectie zelf staat op create/update: () => false).
    {
      name: "previousQuestion",
      type: "text",
      label: "Vervolgvraag op",
      admin: {
        readOnly: true,
        description: "Alleen gezet als dit een vervolg is op een eerdere verduidelijkingsvraag.",
      },
    },
    {
      name: "intentieType",
      type: "select",
      label: "Intentiebepaling",
      options: [
        { label: "Opgelost", value: "opgelost" },
        { label: "Verduidelijkingsvraag gesteld", value: "onduidelijk" },
        { label: "Geen match", value: "geen-match" },
      ],
      admin: { readOnly: true },
    },
    {
      // Label verduidelijkt (2026-07-28, Fase 4) — kolomnaam/relatie
      // ONGEWIJZIGD (nog steeds "kennisbasis-onderwerpen", geen
      // migratierisico). Verwijst naar het intentie-/officiële-term-record
      // uit de (in de UI hernoemde) Helpdesk-onderwerpen-collectie — dat is
      // een ANDER brontype dan de centrale Kennisbasis MijnLeerlijn-Global.
      name: "kennisbasisOnderwerp",
      type: "relationship",
      relationTo: "kennisbasis-onderwerpen",
      label: "Gekoppeld Helpdesk-onderwerp",
      admin: { readOnly: true },
    },
    {
      name: "kennisbasisKandidaten",
      type: "relationship",
      relationTo: "kennisbasis-onderwerpen",
      hasMany: true,
      label: "Overwogen Helpdesk-onderwerpen",
      admin: {
        readOnly: true,
        description: "Alle onderwerpen die de intentiebepaling overwoog, niet alleen het gekozen onderwerp.",
      },
    },
    { name: "gebruikteOfficieleTerm", type: "text", label: "Gebruikte officiële term", admin: { readOnly: true } },
    {
      name: "gebruikteSynoniem",
      type: "text",
      label: "Gebruikte synoniem",
      admin: {
        readOnly: true,
        description: "Best-effort: welke synoniem/formulering de AI herkende. Puur informatief.",
      },
    },
    {
      name: "contactFormSubmitted",
      type: "checkbox",
      defaultValue: false,
      label: "Contactformulier verstuurd",
      admin: { readOnly: true },
    },
    {
      name: "geenHandleidingGevonden",
      type: "checkbox",
      defaultValue: false,
      label: "Geen handleiding gevonden",
      admin: { readOnly: true },
    },
    {
      name: "verbeterStatus",
      type: "select",
      required: true,
      defaultValue: "nieuw",
      label: "Status (AI Verbetercentrum)",
      options: [
        { label: "Nieuw", value: "nieuw" },
        { label: "Beoordeeld", value: "beoordeeld" },
        { label: "Opgelost", value: "opgelost" },
        { label: "Genegeerd", value: "genegeerd" },
      ],
      admin: { readOnly: true },
    },
    {
      name: "promptVersion",
      type: "text",
      label: "Promptversie",
      admin: { readOnly: true, description: "Zie lib/assistant/versions.ts." },
    },
    { name: "retrievalVersion", type: "text", label: "Retrievalversie", admin: { readOnly: true } },
    {
      // Label verduidelijkt (2026-07-28, Fase 4) — dit is de versie van de
      // Helpdesk-onderwerpen-collectie (intentiebepaling), NIET van de
      // centrale Kennisbasis MijnLeerlijn-Global (zie
      // centraleKennisbasisVersion hieronder). Kolomnaam ongewijzigd.
      name: "kennisbasisVersion",
      type: "text",
      label: "Helpdesk-onderwerpen-versie",
      admin: {
        readOnly: true,
        description: "Meest recente wijzigingsdatum onder de overwogen Helpdesk-onderwerpen (intentiebepaling).",
      },
    },
    // Kennisbasis MijnLeerlijn — Fase 4 (2026-07-28): legt per vraag expliciet
    // vast of/welke stand van de centrale Kennisbasis MijnLeerlijn-Global is
    // meegestuurd als achtergrondcontext, en of het taalmodel daarbij een
    // tegenstrijdigheid signaleerde — zie lib/assistant/kennisbasis-context.ts
    // en lib/assistant/answer.ts. Samen met de al bestaande `sources`/
    // `steps`-velden hierboven (welke handleidingen geraadpleegd/getoond
    // zijn) blijft zo zichtbaar of een antwoord uit de centrale kennisbasis,
    // uit handleidingen, of uit beide voortkomt.
    {
      name: "centraleKennisbasisGebruikt",
      type: "checkbox",
      defaultValue: false,
      label: "Centrale kennisbasis gebruikt",
      admin: {
        readOnly: true,
        description:
          "True wanneer de gepubliceerde stand van Kennisbasis MijnLeerlijn als achtergrondcontext is meegestuurd.",
      },
    },
    {
      name: "centraleKennisbasisVersion",
      type: "text",
      label: "Centrale-kennisbasisversie",
      admin: {
        readOnly: true,
        description: "Tijdstempel van de gepubliceerde Kennisbasis MijnLeerlijn-stand op het moment van de vraag.",
      },
    },
    {
      name: "tegenstrijdigheid",
      type: "textarea",
      label: "Gedetecteerde tegenstrijdigheid",
      admin: {
        readOnly: true,
        description:
          "Door het taalmodel gerapporteerd conflict tussen de centrale kennisbasis en een andere bron/de vastgestelde officiële term. Leeg = geen tegenstrijdigheid gedetecteerd.",
      },
    },
  ],
};
