import type { CollectionConfig } from "payload";
import { adminOnly } from "../access/roles";

// Chat delen via URL (2026-08-24) — bevroren snapshots van gedeelde,
// publieke Helpdesk-AI-gesprekken (spec §3: "een gedeelde URL moet een
// snapshot zijn ... nieuwe berichten mogen niet automatisch zichtbaar
// worden"). Bewust volledig dichtgetimmerd, zelfde patroon als
// AssistantConversations.ts/TrainerBestanden.ts: create/update staan hier
// dicht voor de normale Payload-API — alles loopt uitsluitend via
// lib/helpdesk/delen.ts (overrideAccess: true, ná eigen tokenverificatie).
// Lezen is hier UITSLUITEND voor beheer (spec §17: "admin kan een gedeelde
// chat terugvinden/intrekken via Payload-beheer") — de publieke deelpagina
// leest NOOIT via deze Payload-access, maar via lib/helpdesk/delen.ts se
// haalGedeeldeChat() (token-hash-lookup, overrideAccess: true, uitsluitend
// weergavevelden).
export const GedeeldeChats: CollectionConfig = {
  slug: "gedeelde-chats",
  admin: {
    useAsTitle: "id",
    defaultColumns: ["id", "createdAt", "revokedAt", "bronConversaties"],
    group: "Basis — Technisch beheer",
    description: "Snapshots van gedeelde Helpdesk-AI-gesprekken — beheer/intrekken (zie ook lib/helpdesk/delen.ts).",
  },
  access: {
    read: adminOnly,
    create: () => false,
    update: () => false,
    delete: adminOnly,
  },
  fields: [
    {
      name: "tokenHash",
      type: "text",
      required: true,
      unique: true,
      index: true,
      label: "Token-hash",
      admin: { readOnly: true, description: "sha256-hash van de share-token — nooit de ruwe token zelf." },
    },
    {
      name: "berichten",
      type: "array",
      required: true,
      minRows: 1,
      label: "Berichten",
      labels: { singular: "Bericht", plural: "Berichten" },
      admin: { readOnly: true, description: "Bevroren kopie — nooit bijgewerkt na het aanmaken van deze deel-link." },
      fields: [
        { name: "vraag", type: "textarea", required: true, label: "Vraag" },
        { name: "antwoord", type: "textarea", required: true, label: "Antwoord" },
        {
          name: "manuals",
          type: "array",
          label: "Handleidingen",
          fields: [
            { name: "manualId", type: "number", required: true, label: "Handleiding-ID" },
            { name: "title", type: "text", required: true, label: "Titel" },
            { name: "hasFile", type: "checkbox", defaultValue: false, label: "Heeft bestand" },
          ],
        },
        {
          name: "steps",
          type: "array",
          label: "Handleidingstappen",
          fields: [
            { name: "handleidingId", type: "number", required: true, label: "Handleiding-ID" },
            { name: "handleidingSlug", type: "text", required: true, label: "Handleiding-slug" },
            { name: "handleidingTitel", type: "text", required: true, label: "Handleiding-titel" },
            { name: "handleidingUrl", type: "text", required: true, label: "Handleiding-URL" },
            { name: "stepId", type: "text", required: true, label: "Stap-ID" },
            { name: "stepNummer", type: "number", required: true, label: "Stapnummer" },
            { name: "titel", type: "text", required: true, label: "Titel" },
            { name: "uitleg", type: "textarea", required: true, label: "Uitleg" },
            {
              name: "images",
              type: "array",
              label: "Afbeeldingen",
              fields: [
                { name: "url", type: "text", required: true, label: "URL" },
                { name: "caption", type: "text", label: "Onderschrift" },
                { name: "alt", type: "text", required: true, label: "Alt-tekst" },
              ],
            },
          ],
        },
      ],
    },
    {
      name: "bronConversaties",
      type: "relationship",
      relationTo: "assistant-conversations",
      hasMany: true,
      label: "Bron-conversaties",
      admin: { readOnly: true, description: "Uitsluitend voor beheer/herleidbaarheid — nooit publiek geretourneerd." },
    },
    {
      name: "revokedAt",
      type: "date",
      label: "Ingetrokken op",
      admin: { readOnly: true, description: "Gezet zodra de deel-link is ingetrokken — vanaf dan niet meer publiek bereikbaar." },
    },
  ],
};
