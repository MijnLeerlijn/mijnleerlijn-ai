import type { Block } from "payload";

// ContentBlock type "download" — referentie naar Media (bestand) + labeltekst.
export const DownloadBlock: Block = {
  slug: "download",
  labels: { singular: "Download", plural: "Downloads" },
  fields: [
    { name: "media", type: "upload", relationTo: "media", required: true, label: "Bestand" },
    { name: "label", type: "text", required: true, label: "Labeltekst" },
  ],
};
