import type { CollectionConfig } from "payload";
import { adminOnly, anyEditor } from "../access/roles";

// Sales-assistent V1 (2026-08-14) — geaccepteerde/handmatig aangemaakte
// volgende stappen. `dueDate` wordt (na accepteren/aanpassen) automatisch
// teruggeschreven naar Monday's `date_mm5qswfk` — zie lib/sales/proposals.ts
// + lib/sales/writeback.ts. `linkedMailDraft` verwijst naar de bestaande
// mail-drafts-collectie (Creator) — geen tweede mailopslag.
export const SalesActions: CollectionConfig = {
  slug: "sales-actions",
  labels: { singular: "Sales-actie", plural: "Sales-acties" },
  admin: {
    useAsTitle: "description",
    defaultColumns: ["school", "type", "dueDate", "status", "channel"],
    group: "Sales",
    description: "Geaccepteerde of handmatig aangemaakte volgende stappen per school.",
  },
  access: {
    read: anyEditor,
    create: anyEditor,
    update: anyEditor,
    delete: adminOnly,
  },
  fields: [
    { name: "school", type: "relationship", relationTo: "sales-schools", required: true, label: "School", index: true },
    {
      name: "type",
      type: "select",
      required: true,
      label: "Type",
      options: [
        { label: "Mail", value: "mail" },
        { label: "Bellen", value: "bellen" },
        { label: "Afspraak", value: "afspraak" },
        { label: "Voorbereiding", value: "voorbereiding" },
        { label: "Informatie sturen", value: "informatie_sturen" },
        { label: "Anders", value: "anders" },
      ],
    },
    { name: "description", type: "text", required: true, label: "Omschrijving" },
    { name: "dueDate", type: "date", required: true, label: "Datum" },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "open",
      label: "Status",
      options: [
        { label: "Open", value: "open" },
        { label: "Afgerond", value: "afgerond" },
        { label: "Vervallen", value: "vervallen" },
      ],
    },
    {
      name: "channel",
      type: "select",
      label: "Kanaal",
      options: [
        { label: "Mail", value: "mail" },
        { label: "Telefoon", value: "telefoon" },
        { label: "In persoon", value: "in_persoon" },
        { label: "Anders", value: "anders" },
      ],
    },
    { name: "sourceProposal", type: "relationship", relationTo: "sales-proposals", label: "Bron-voorstel" },
    { name: "createdBy", type: "relationship", relationTo: "users", label: "Aangemaakt door", access: { update: () => false }, admin: { position: "sidebar", readOnly: true } },
    { name: "completedAt", type: "date", label: "Afgerond op" },
    { name: "cancellationReason", type: "text", label: "Reden vervallen" },
    { name: "linkedMailDraft", type: "relationship", relationTo: "mail-drafts", label: "Gekoppeld mailconcept" },
  ],
  hooks: {
    beforeChange: [
      ({ operation, data, req }) => {
        if (operation === "create" && req.user && !data.createdBy) data.createdBy = req.user.id;
        return data;
      },
    ],
  },
};
