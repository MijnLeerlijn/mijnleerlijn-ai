import type { Block } from "payload";

// ContentBlock type "waarschuwing" — tekst, visueel gemarkeerd als waarschuwing.
export const WaarschuwingBlock: Block = {
  slug: "waarschuwing",
  labels: { singular: "Waarschuwing", plural: "Waarschuwingen" },
  fields: [{ name: "body", type: "textarea", required: true, label: "Waarschuwingstekst" }],
};
