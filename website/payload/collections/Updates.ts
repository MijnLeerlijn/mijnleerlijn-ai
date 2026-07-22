import type { CollectionConfig } from "payload";
import { centralEditorOnly } from "../access/roles";

// Redactioneel gecureerde "Net bijgewerkt"-lijst (homepage/updates-pagina) —
// zie lib/data/updates.ts (Fase 3-dummydata die dit vervangt). Titel/categorie
// worden niet gedupliceerd maar afgeleid van het gekoppelde artikel bij het
// opvragen (services/payload.ts), zodat er nooit twee bronnen van waarheid
// voor dezelfde titel kunnen ontstaan.
export const Updates: CollectionConfig = {
  slug: "updates",
  admin: {
    useAsTitle: "article",
    defaultColumns: ["article", "badge", "date"],
    group: "Content",
    description: "Redactioneel gekozen recente wijzigingen, getoond op de homepage en /updates.",
  },
  access: {
    read: () => true,
    create: centralEditorOnly,
    update: centralEditorOnly,
    delete: centralEditorOnly,
  },
  fields: [
    { name: "article", type: "relationship", relationTo: "articles", required: true, label: "Artikel" },
    {
      name: "badge",
      type: "select",
      required: true,
      defaultValue: "Bijgewerkt",
      label: "Label",
      options: [
        { label: "Nieuw", value: "Nieuw" },
        { label: "Bijgewerkt", value: "Bijgewerkt" },
      ],
    },
    {
      name: "date",
      type: "date",
      required: true,
      defaultValue: () => new Date().toISOString(),
      label: "Datum",
    },
  ],
};
