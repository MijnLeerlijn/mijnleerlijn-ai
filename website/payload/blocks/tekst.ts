import type { Block } from "payload";
import { lexicalEditor } from "@payloadcms/richtext-lexical";

// ContentBlock type "tekst" — zie docs/DATA-MODEL.md §ContentBlock: "vrije
// tekst (rich text)", als enige bloktype expliciet rich text.
export const TekstBlock: Block = {
  slug: "tekst",
  labels: { singular: "Tekst", plural: "Tekstblokken" },
  fields: [{ name: "body", type: "richText", required: true, editor: lexicalEditor(), label: "Tekst" }],
};
