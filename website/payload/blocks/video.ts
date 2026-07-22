import type { Block } from "payload";

// ContentBlock type "video" — video-URL/embed + bijschrift.
export const VideoBlock: Block = {
  slug: "video",
  labels: { singular: "Video", plural: "Video's" },
  fields: [
    { name: "url", type: "text", required: true, label: "Video-URL" },
    { name: "caption", type: "text", label: "Bijschrift" },
  ],
};
