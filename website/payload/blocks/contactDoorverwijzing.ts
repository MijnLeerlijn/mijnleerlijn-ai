import type { Block } from "payload";

// ContentBlock type "contact_doorverwijzing" — tekst + link naar het
// contactformulier (optioneel voorgevuld onderwerp).
export const ContactDoorverwijzingBlock: Block = {
  slug: "contact_doorverwijzing",
  labels: { singular: "Contact-doorverwijzing", plural: "Contact-doorverwijzingen" },
  fields: [
    { name: "body", type: "textarea", required: true, label: "Tekst" },
    { name: "prefilledSubject", type: "text", label: "Voorgevuld onderwerp" },
  ],
};
