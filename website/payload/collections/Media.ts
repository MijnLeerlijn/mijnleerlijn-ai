import type { CollectionConfig } from "payload";
import { anyEditor, centralEditorOnly } from "../access/roles";

// Zie docs/DATA-MODEL.md §Media. Opslag zelf (lokale schijf in development,
// Vercel Blob in productie) wordt buiten deze collection om geregeld door de
// vercelBlobStorage-plugin in payload.config.ts — deze collection weet daar
// niets van, consistent met de services/storage.ts-abstractie.
export const Media: CollectionConfig = {
  slug: "media",
  admin: {
    useAsTitle: "altText",
    defaultColumns: ["filename", "mediaType", "altText"],
    group: "Content",
  },
  access: {
    read: () => true,
    create: anyEditor,
    update: anyEditor,
    delete: centralEditorOnly,
  },
  upload: {
    mimeTypes: [
      "image/*",
      "video/*",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    imageSizes: [
      { name: "thumbnail", width: 400, height: 300, position: "centre" },
      { name: "card", width: 800, height: 600, position: "centre" },
    ],
    // Sprint 6 (handleidingen, private Blob store): lib/knowledge/sync-
    // manuals.ts's maakMediaDoc() maakt media-documenten aan die rechtstreeks
    // naar een al bestaande, private Blob wijzen (filename/mimeType/filesize/
    // url handmatig gezet), zonder een echt `file` mee te sturen — dat zou de
    // gedeelde vercelBlobStorage-plugin triggeren, die alleen 'public'
    // ondersteunt. Zonder filesRequiredOnCreate: false weigert Payload elke
    // create() zonder file, ook deze. Normale admin-uploads (met een echt
    // bestand) zijn hierdoor niet beïnvloed.
    filesRequiredOnCreate: false,
  },
  fields: [
    {
      name: "altText",
      type: "text",
      required: true,
      label: "Alt-tekst",
      admin: { description: "Verplicht voor toegankelijkheid — beschrijft de afbeelding, nooit leeg." },
    },
    {
      name: "mediaType",
      type: "select",
      required: true,
      defaultValue: "afbeelding",
      label: "Type",
      options: [
        { label: "Afbeelding", value: "afbeelding" },
        { label: "Video", value: "video" },
        { label: "Download", value: "download" },
      ],
    },
  ],
};
