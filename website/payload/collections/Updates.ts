import type { CollectionConfig } from "payload";
import { centralEditorOnly } from "../access/roles";
import { permissieOnly } from "../access/menu-permissions";

// Redactioneel gecureerde "Net bijgewerkt"-lijst (homepage/updates-pagina) —
// zie lib/data/updates.ts (Fase 3-dummydata die dit vervangt). Titel/categorie
// worden niet gedupliceerd maar afgeleid van het gekoppelde artikel bij het
// opvragen (services/payload.ts), zodat er nooit twee bronnen van waarheid
// voor dezelfde titel kunnen ontstaan.
export const Updates: CollectionConfig = {
  slug: "updates",
  labels: { singular: "Update", plural: "Updates" },
  admin: {
    useAsTitle: "article",
    defaultColumns: ["article", "badge", "date"],
    group: "Basis",
    description: "Redactioneel gekozen recente wijzigingen, getoond op de homepage en /updates.",
  },
  access: {
    read: () => true,
    create: permissieOnly("algemeen.updates", centralEditorOnly),
    update: permissieOnly("algemeen.updates", centralEditorOnly),
    delete: permissieOnly("algemeen.updates", centralEditorOnly),
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
