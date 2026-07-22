import type { CollectionConfig } from "payload";
import { centralEditorOnly } from "../access/roles";

// Structurele, variant-onafhankelijke indeling van de kennisbank — zie
// docs/DATA-MODEL.md (Article.category) en lib/data/categories.ts (Fase 3).
// Net als de centrale artikelboom is dit een centrale-redacteur-bevoegdheid,
// geen variant-override.
export const Categories: CollectionConfig = {
  slug: "categories",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "slug", "color"],
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
    { name: "slug", type: "text", required: true, unique: true, label: "Slug" },
    {
      name: "icon",
      type: "text",
      required: true,
      label: "Icoon",
      admin: { description: "Naam van een Lucide-icoon, bijv. 'Target'." },
    },
    {
      name: "color",
      type: "select",
      required: true,
      label: "Kleur",
      options: [
        { label: "Blauw", value: "blauw" },
        { label: "Groen", value: "groen" },
        { label: "Oranje", value: "oranje" },
        { label: "Geel", value: "geel" },
        { label: "Rood", value: "rood" },
      ],
    },
    { name: "description", type: "textarea", required: true, label: "Uitleg" },
  ],
};
