import type { CollectionConfig } from "payload";
import { adminOnly, anyEditor } from "../access/roles";

// Duim-omhoog/omlaag onder een AI-antwoord (components/molecules/
// FeedbackControl.tsx) — zie docs/AI-KNOWLEDGE-STRATEGY.md §Kwaliteitsbewaking.
// Bewust een platte, simpele collectie zonder eigen beheer-UI (dat is
// UX-DESIGN.md scherm 14, expliciet bewust uitgesteld tot na livegang) — de
// standaard Payload-admin-lijst volstaat om steekproefsgewijs te controleren.
//
// Schrijven gebeurt uitsluitend via app/api/feedback/route.ts (rate-limited)
// — dezelfde reden als ContactSubmissions: de publieke API staat `create`
// daarom dicht.
export const AnswerFeedback: CollectionConfig = {
  slug: "answer-feedback",
  admin: {
    useAsTitle: "vraag",
    defaultColumns: ["vraag", "rating", "variant", "createdAt"],
    group: "Beheer",
    description:
      "Ja/nee-feedback van bezoekers op AI-antwoorden. Aanmaken kan alleen via de eigen API-route.",
  },
  access: {
    read: anyEditor,
    create: () => false,
    update: () => false,
    delete: adminOnly,
  },
  fields: [
    { name: "vraag", type: "text", required: true, label: "Gestelde vraag" },
    { name: "antwoordTekst", type: "textarea", required: true, label: "Getoond antwoord" },
    {
      name: "bronArtikelSlugs",
      type: "text",
      hasMany: true,
      label: "Geciteerde artikelen (slugs)",
    },
    { name: "variant", type: "relationship", relationTo: "variants", label: "Variant" },
    {
      name: "rating",
      type: "select",
      required: true,
      label: "Beoordeling",
      options: [
        { label: "Nuttig", value: "nuttig" },
        { label: "Niet nuttig", value: "niet_nuttig" },
      ],
    },
    { name: "pageUrl", type: "text", label: "Pagina-URL" },
    { name: "createdAt", type: "date", required: true, label: "Ingediend op" },
  ],
};
