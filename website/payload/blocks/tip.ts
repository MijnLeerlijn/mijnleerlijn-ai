import type { Block } from "payload";

// ContentBlock type "tip" — tekst, visueel gemarkeerd als tip.
export const TipBlock: Block = {
  slug: "tip",
  labels: { singular: "Tip", plural: "Tips" },
  fields: [{ name: "body", type: "textarea", required: true, label: "Tiptekst" }],
};
