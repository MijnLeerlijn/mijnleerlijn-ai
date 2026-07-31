import type { CollectionConfig } from "payload";
import { anyEditor, centralEditorOnly } from "../access/roles";

// Zie docs/DATA-MODEL.md §Media. Opslag zelf wordt buiten deze collection om
// geregeld door lib/media/private-blob-adapter.ts (via
// @payloadcms/plugin-cloud-storage, geregistreerd in payload.config.ts) —
// deze collection weet daar niets van, consistent met de
// services/storage.ts-abstractie.
//
// Uniforme private-uploadarchitectuur (2026-07-31, vervangt
// @payloadcms/storage-vercel-blob): de mijnleerlijn-media-Blob-store is
// bewust private (opdracht: "maak mijnleerlijn-media niet publiek", zie
// app/api/knowledge-sources/upload-file/route.ts) — elke upload hier gaat nu
// via dezelfde private-opslaglogica als Downloadbeheer's PDF-upload al
// gebruikte. Het opgeslagen `url`-veld is de ECHTE, private Blob-URL, nooit
// rechtstreeks bruikbaar als publieke link — lezen loopt altijd via
// app/api/media/[id] (zie services/payload.ts's mediaUrl()).
export const Media: CollectionConfig = {
  slug: "media",
  labels: { singular: "Media-bestand", plural: "Media" },
  admin: {
    useAsTitle: "altText",
    defaultColumns: ["filename", "mediaType", "altText"],
    group: "Basis",
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
    // Geen imageSizes/thumbnail-varianten: niets in de applicatie leest
    // media.sizes.*.url (geverifieerd), en de generieke cloud-storage-
    // adapter-orchestratie kan meerdere gelijktijdige bestandsvarianten per
    // upload niet correct samenvoegen zonder een deterministische
    // generateURL — niet zinvol voor een store met willekeurige, unieke
    // sleutels per upload. Zie lib/media/private-blob-adapter.ts.
    //
    // Admin-preview wijst naar de stabiele, publiek te gebruiken route
    // (dezelfde die de rest van de applicatie ook gebruikt) i.p.v.
    // rechtstreeks het (private, niet-hotlinkbare) url-veld.
    adminThumbnail: ({ doc }) => `/api/media/${doc.id}`,
    // Sprint 6 (handleidingen, private Blob store): lib/knowledge/sync-
    // manuals.ts's maakMediaDoc() maakt media-documenten aan die rechtstreeks
    // naar een al bestaande, private Blob wijzen (filename/mimeType/filesize/
    // url handmatig gezet), zonder een echt `file` mee te sturen. Zonder
    // filesRequiredOnCreate: false weigert Payload elke create() zonder
    // file, ook deze. Normale admin-uploads (met een echt bestand) zijn
    // hierdoor niet beïnvloed.
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
