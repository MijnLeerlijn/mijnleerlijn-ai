import type { CollectionConfig } from "payload";
import { adminOnly, anyEditor } from "../access/roles";

// Zie docs/DATA-MODEL.md §ContactSubmission/§Attachment en
// docs/SECURITY-AND-PRIVACY.md. Bewust GEEN Payload upload-collection: de
// bestanden zelf staan privé in Vercel Blob (services/storage.ts,
// kortlevende signed download-URL's), hier staat alleen metadata —
// `attachments` is een genest array-veld (geen aparte collection) zodat
// "verwijderen op verzoek" één samenhangende actie is (de metadata verdwijnt
// automatisch mee met het ouderdocument; de blobs zelf worden in de
// afterDelete-hook hieronder actief verwijderd).
//
// Schrijven gebeurt uitsluitend via app/api/contact/route.ts met Payload's
// local API en `overrideAccess: true` (na eigen validatie, honeypot- en
// rate-limit-controle) — de publieke REST/GraphQL-API van deze collection
// staat daarom NIET open voor `create`, zodat die controles nooit omzeild
// kunnen worden.
export const ContactSubmissions: CollectionConfig = {
  slug: "contact-submissions",
  admin: {
    useAsTitle: "subject",
    defaultColumns: ["teacherName", "schoolName", "requestType", "status", "submittedAt"],
    group: "Beheer",
    description: "Inzendingen van het contactformulier. Aanmaken kan alleen via de eigen API-route.",
  },
  access: {
    read: anyEditor,
    create: () => false,
    update: anyEditor,
    delete: adminOnly,
  },
  fields: [
    { name: "teacherName", type: "text", required: true, label: "Naam leerkracht" },
    { name: "schoolName", type: "text", required: true, label: "Naam school" },
    { name: "email", type: "email", required: true, label: "E-mail" },
    { name: "requestType", type: "text", required: true, label: "Soort vraag" },
    { name: "subject", type: "text", required: true, label: "Onderwerp" },
    { name: "problemDescription", type: "textarea", required: true, label: "Uitleg van het probleem" },
    { name: "expected", type: "textarea", label: "Wat verwacht je?" },
    { name: "actual", type: "textarea", label: "Wat zie je daadwerkelijk?" },
    { name: "pageUrl", type: "text", label: "URL van de softwarepagina" },
    { name: "variant", type: "relationship", relationTo: "variants", label: "Variant" },
    { name: "helpCenterUrl", type: "text", label: "Kennisplatform-URL" },
    { name: "submittedAt", type: "date", required: true, label: "Ingediend op" },
    {
      name: "deviceInfo",
      type: "text",
      label: "Apparaat",
      admin: {
        description: "Alleen een grove categorie (bv. 'Chrome op desktop') — nooit een volledige user-agent.",
      },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "nieuw",
      label: "Status",
      options: [
        { label: "Nieuw", value: "nieuw" },
        { label: "In behandeling", value: "in_behandeling" },
        { label: "Afgehandeld", value: "afgehandeld" },
      ],
    },
    {
      name: "attachments",
      type: "array",
      label: "Bijlagen",
      labels: { singular: "Bijlage", plural: "Bijlagen" },
      admin: {
        description: "Bestanden staan privé in Vercel Blob. Downloaden genereert een kortlevende signed URL.",
      },
      fields: [
        {
          name: "storageKey",
          type: "text",
          required: true,
          label: "Opslagsleutel",
          admin: { readOnly: true },
        },
        { name: "filename", type: "text", required: true, label: "Bestandsnaam" },
        { name: "mimeType", type: "text", required: true, label: "Bestandstype" },
        { name: "sizeBytes", type: "number", required: true, label: "Grootte (bytes)" },
        { name: "uploadedAt", type: "date", required: true, label: "Geüpload op" },
      ],
    },
  ],
  hooks: {
    afterDelete: [
      async ({ doc }) => {
        const attachments = (doc?.attachments ?? []) as { storageKey: string }[];
        if (attachments.length === 0) return;
        const { verwijderBijlage } = await import("@/services/storage");
        await Promise.all(attachments.map((a) => verwijderBijlage(a.storageKey).catch(() => undefined)));
      },
    ],
  },
};
