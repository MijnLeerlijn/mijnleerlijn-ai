import type { CollectionConfig } from "payload";
import { centralEditorOnly } from "../access/roles";
import { permissieOnly } from "../access/menu-permissions";

// Structurele, variant-onafhankelijke indeling van de kennisbank — zie
// docs/DATA-MODEL.md (Article.category) en lib/data/categories.ts (Fase 3).
// Net als de centrale artikelboom is dit een centrale-redacteur-bevoegdheid,
// geen variant-override.
export const Categories: CollectionConfig = {
  slug: "categories",
  labels: { singular: "Categorie", plural: "Categorieën" },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "slug", "color"],
    group: "Basis",
  },
  access: {
    read: () => true,
    create: permissieOnly("algemeen.categorieen", centralEditorOnly),
    update: permissieOnly("algemeen.categorieen", centralEditorOnly),
    delete: permissieOnly("algemeen.categorieen", centralEditorOnly),
  },
  fields: [
    { name: "title", type: "text", required: true, label: "Titel" },
    { name: "slug", type: "text", required: true, unique: true, label: "Slug" },
    {
      name: "icon",
      type: "text",
      required: true,
      label: "Icoon",
      admin: {
        description:
          "Naam van een Lucide-icoon (kebab-case, bijv. 'rocket'). Kies via de Downloadcategorieën-beheerpagina — iedere naam uit de Lucide-iconenbibliotheek is geldig; onbekende namen vallen bij weergave veilig terug op een standaardicoon.",
      },
    },
    {
      name: "color",
      type: "select",
      required: true,
      label: "Kleur",
      // Categorie-uiterlijk (2026-07-29): uitgebreid van 5 naar 9 stabiele,
      // Engelse waarden (migratie 20260729_150000_categorie_kleuren_uitbreiden
      // hernoemt de onderliggende Postgres-ENUM 1-op-1, bestaande categorieën
      // behouden hun kleur). Kies via de Downloadcategorieën-beheerpagina
      // (visuele kleurenkiezer, geen dropdown) — deze `options` bepalen alleen
      // wat geldig is, niet hoe je kiest.
      options: [
        { label: "Blauw", value: "blue" },
        { label: "Groen", value: "green" },
        { label: "Rood", value: "red" },
        { label: "Oranje", value: "orange" },
        { label: "Geel", value: "yellow" },
        { label: "Paars", value: "purple" },
        { label: "Teal", value: "teal" },
        { label: "Roze", value: "pink" },
        { label: "Leigrijs", value: "slate" },
      ],
    },
    { name: "description", type: "textarea", required: true, label: "Uitleg" },
    {
      name: "volgorde",
      type: "number",
      label: "Volgorde",
      admin: {
        position: "sidebar",
        description:
          "Bepaalt de volgorde van categorieën op de publieke downloadpagina. Laag = eerder. Leeg = alfabetisch, onderaan. Wordt beheerd via de 'Downloadcategorieën'-pagina in het menu.",
      },
    },
  ],
};
