import type { Block } from "payload";

// ContentBlock type "afbeelding" — referentie naar Media + bijschrift.
export const AfbeeldingBlock: Block = {
  slug: "afbeelding",
  labels: { singular: "Afbeelding", plural: "Afbeeldingen" },
  fields: [
    { name: "media", type: "upload", relationTo: "media", required: true, label: "Afbeelding" },
    { name: "caption", type: "text", label: "Bijschrift" },
  ],
};
