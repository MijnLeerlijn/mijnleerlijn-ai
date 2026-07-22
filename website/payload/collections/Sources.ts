import type { CollectionConfig } from "payload";
import { centralEditorOnly } from "../access/roles";

// Citeerbaar bronmateriaal waar artikelen naar kunnen verwijzen bij
// bronvermelding — bijv. een interne handleiding, een externe link, een
// onderzoeksdocument. Dit is een nieuwe collection t.o.v. docs/DATA-MODEL.md
// (dat document kent geen apart "Source"-entiteit, alleen impliciete
// bronvermelding via Article/Section-metadata) — expliciet toegevoegd op
// instructie van Fase 4 Stap 3. Zie het opleveringsrapport voor de motivatie.
// Betrouwbaarheid en gebruiksrechten zijn relevant voorwerk voor de
// AI-betrouwbaarheidsdrempel uit docs/AI-KNOWLEDGE-STRATEGY.md (Fase 6),
// maar worden hier al vastgelegd omdat ze bij de bron zelf horen.
export const Sources: CollectionConfig = {
  slug: "sources",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "type", "publisher", "reliability"],
    group: "Content",
  },
  access: {
    read: () => true,
    create: centralEditorOnly,
    update: centralEditorOnly,
    delete: centralEditorOnly,
  },
  fields: [
    { name: "title", type: "text", required: true, label: "Titel" },
    {
      name: "type",
      type: "select",
      required: true,
      defaultValue: "interne_handleiding",
      label: "Type",
      options: [
        { label: "Interne handleiding", value: "interne_handleiding" },
        { label: "Externe link", value: "externe_link" },
        { label: "Document", value: "document" },
        { label: "Onderzoek", value: "onderzoek" },
        { label: "Overig", value: "overig" },
      ],
    },
    {
      name: "url",
      type: "text",
      label: "URL",
      admin: {
        description: "Voor een externe link of online publicatie.",
        condition: (_d, s) => s?.type !== "document",
      },
    },
    {
      name: "file",
      type: "upload",
      relationTo: "media",
      label: "Bestand",
      admin: { description: "Voor een geüpload document.", condition: (_d, s) => s?.type === "document" },
    },
    { name: "publisher", type: "text", label: "Eigenaar/uitgever" },
    { name: "publishedDate", type: "date", label: "Datum" },
    {
      name: "reliability",
      type: "select",
      required: true,
      defaultValue: "gemiddeld",
      label: "Betrouwbaarheid",
      options: [
        { label: "Hoog", value: "hoog" },
        { label: "Gemiddeld", value: "gemiddeld" },
        { label: "Laag", value: "laag" },
      ],
    },
    {
      name: "variantContext",
      type: "relationship",
      relationTo: "variants",
      hasMany: true,
      label: "Variantcontext",
      admin: {
        description:
          "Leeg = relevant voor alle varianten. Ingevuld = alleen relevant binnen deze variant(en).",
      },
    },
    { name: "usageRights", type: "text", label: "Gebruiksrechten" },
    {
      name: "internalStatus",
      type: "select",
      required: true,
      defaultValue: "concept",
      label: "Interne status",
      options: [
        { label: "Concept", value: "concept" },
        { label: "Goedgekeurd", value: "goedgekeurd" },
        { label: "Verouderd", value: "verouderd" },
      ],
    },
  ],
};
