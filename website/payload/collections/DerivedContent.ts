import type { CollectionConfig } from "payload";
import { adminFieldOnly, adminOnly, anyEditor } from "../access/roles";

// Creator V1 (2026-08-13) — "Maak hiervan"-route: nieuwsbrief/LinkedIn-post/
// partnertekst afgeleid van een masterartikel. Bewust GEEN los
// ContentFamilies-concept: `sourceArticle` ÍS de koppeling naar de familie
// (samen met VariantOverrides.targetArticle) — een familie is een
// read-time-samenstelling via deze relatie, nooit een apart opgeslagen
// groepering die uit sync kan raken. Zie de Creator-onderzoeksfase in de
// sessiegeschiedenis voor de volledige afweging.
//
// Eén collectie voor alle kanalen (channel-select), bewust geen aparte
// collectie per kanaal — dat zou N bijna-identieke schema's geven voor wat
// in essentie dezelfde afgeleide-contentvorm is. `audience`/`goal` zijn los
// en optioneel gehouden i.p.v. één schema per kanaal (nieuwsbrief gebruikt
// ze, LinkedIn/partnertekst hoeven ze niet in te vullen).
export const DerivedContent: CollectionConfig = {
  slug: "derived-content",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "channel", "sourceArticle", "status", "updatedAt"],
    group: "Basis — Technisch beheer",
    description: "Afgeleide content (nieuwsbrief/LinkedIn/partnertekst) per masterartikel, aangemaakt via Creator.",
  },
  access: {
    read: anyEditor,
    create: anyEditor,
    update: anyEditor,
    delete: adminOnly,
  },
  fields: [
    {
      name: "sourceArticle",
      type: "relationship",
      relationTo: "articles",
      required: true,
      label: "Bronartikel",
    },
    {
      name: "channel",
      type: "select",
      required: true,
      label: "Kanaal",
      options: [
        { label: "Nieuwsbrief", value: "nieuwsbrief" },
        { label: "LinkedIn", value: "linkedin" },
        { label: "Partnertekst", value: "partnertekst" },
      ],
    },
    { name: "title", type: "text", label: "Titel/onderwerpregel" },
    { name: "content", type: "textarea", required: true, label: "Tekst" },
    { name: "cta", type: "text", label: "Call-to-action" },
    {
      name: "audience",
      type: "select",
      label: "Doelgroep",
      admin: { description: "Vooral relevant voor nieuwsbrief." },
      options: [
        { label: "Nieuwe scholen", value: "nieuwe_scholen" },
        { label: "Bestaande scholen", value: "bestaande_scholen" },
        { label: "Overig", value: "overig" },
      ],
    },
    { name: "goal", type: "text", label: "Doel", admin: { description: "Bijv. 'demo aanvragen', 'feature gebruiken'." } },
    {
      name: "variantContext",
      type: "relationship",
      relationTo: "variants",
      hasMany: true,
      label: "Variant-context",
      admin: { position: "sidebar", description: "Leeg = voor alle varianten, bijv. bij een variant-specifieke nieuwsbrief." },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "concept",
      label: "Status",
      options: [
        { label: "Concept", value: "concept" },
        { label: "Gepubliceerd", value: "gepubliceerd" },
      ],
    },
    {
      name: "generatedByAi",
      type: "checkbox",
      defaultValue: false,
      label: "AI-gegenereerd",
      access: { update: adminFieldOnly },
      admin: { position: "sidebar", readOnly: true },
    },
  ],
};
