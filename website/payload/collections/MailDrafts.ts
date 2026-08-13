import type { CollectionConfig } from "payload";
import { adminFieldOnly, adminOnly, anyEditor } from "../access/roles";

// Creator V1 (2026-08-13) — "Mail schrijven"-route. Bewust GEEN
// Gmail-koppeling: V1 gaat uit van handmatig plakken van een ontvangen mail
// (zie de sessie-onderzoeksfase — Gmail is vandaag alleen-lezen en
// losstaand, payload/globals/GmailConnection.ts + SupportThreads.ts).
//
// `receivedText` is bewust optioneel: de meest herleidbare tekst in deze
// hele flow zit hierin (namen, schoolinformatie, tijdelijke afspraken).
// Productadvies (nog niet hier afgedwongen): pas vullen tijdens een actief
// concept, leegmaken zodra status "afgehandeld" is. `draftReply` is het
// AI-geassisteerde antwoord — aanzienlijk lager privacyrisico, mag wel
// bewaard blijven. Een eventueel kennisstuk uit "Maak hier een kennisstuk
// van" is en blijft een LOS record (knowledge-drafts, via sourceMailDraft
// daar) — nooit samengevoegd met dit record, zie design-regel 8/9 uit de
// Creator-opdracht.
//
// group hier bewust hetzelfde als KnowledgeDrafts — al verborgen via
// admin-shell.css se native-nav-hiding, dus geen extra CSS-regel nodig.
// Zichtbaar voor gebruikers uitsluitend via de Creator-navigatie/werkruimte.
export const MailDrafts: CollectionConfig = {
  slug: "mail-drafts",
  admin: {
    useAsTitle: "subject",
    defaultColumns: ["subject", "status", "updatedAt"],
    group: "Basis — Technisch beheer",
    description: "Concept-mailantwoorden geschreven met Creator.",
  },
  access: {
    read: anyEditor,
    create: anyEditor,
    update: anyEditor,
    delete: adminOnly,
  },
  fields: [
    { name: "subject", type: "text", label: "Onderwerp" },
    {
      name: "receivedText",
      type: "textarea",
      label: "Ontvangen mail (tijdelijk)",
      admin: {
        description: "Bewaar dit niet langer dan nodig — maak dit veld leeg zodra het concept is afgehandeld.",
      },
    },
    { name: "draftReply", type: "textarea", required: true, label: "Conceptantwoord" },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "concept",
      label: "Status",
      options: [
        { label: "Concept", value: "concept" },
        { label: "Afgehandeld", value: "afgehandeld" },
      ],
    },
    {
      name: "linkedKnowledgeDraft",
      type: "relationship",
      relationTo: "knowledge-drafts",
      label: "Gekoppeld kennisstuk",
      access: { update: adminFieldOnly },
      admin: { readOnly: true, description: "Automatisch gezet nadat 'Maak hier een kennisstuk van' is gebruikt." },
    },
    {
      name: "variantContext",
      type: "relationship",
      relationTo: "variants",
      hasMany: true,
      label: "Variant-context",
      admin: { position: "sidebar", description: "Leeg = niet variant-specifiek." },
    },
    {
      name: "createdBy",
      type: "relationship",
      relationTo: "users",
      label: "Aangemaakt door",
      access: { update: () => false },
      admin: { position: "sidebar", readOnly: true },
    },
  ],
  hooks: {
    beforeChange: [
      ({ operation, data, req }) => {
        if (operation === "create" && req.user && !data.createdBy) data.createdBy = req.user.id;
        return data;
      },
    ],
  },
};
