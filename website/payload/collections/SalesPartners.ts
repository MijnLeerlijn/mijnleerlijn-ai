import type { CollectionConfig } from "payload";
import { adminOnly, anyEditor } from "../access/roles";
import { permissieOnly } from "../access/menu-permissions";

export const SalesPartners: CollectionConfig = {
  slug: "sales-partners",
  labels: { singular: "Sales-partner", plural: "Sales-partners" },
  admin: {
    useAsTitle: "naam",
    defaultColumns: ["naam", "status", "startDatum", "doelLicenties", "verantwoordelijke"],
    group: "Sales — systeem",
    description: "Partnerdossier voor commerciële afspraken, doelen, acties en mijlpalen.",
  },
  access: {
    read: permissieOnly("sales.partners", anyEditor),
    create: permissieOnly("sales.partners", adminOnly),
    update: permissieOnly("sales.partners", adminOnly),
    delete: permissieOnly("sales.partners", adminOnly),
  },
  fields: [
    { name: "naam", type: "text", required: true, unique: true, label: "Partner" },
    { name: "startDatum", type: "date", label: "Start samenwerking" },
    {
      name: "status",
      type: "select",
      defaultValue: "actief",
      label: "Status",
      options: [
        { label: "Verkenning", value: "verkenning" },
        { label: "Actief", value: "actief" },
        { label: "On hold", value: "on_hold" },
        { label: "Gestopt", value: "gestopt" },
      ],
    },
    { name: "verantwoordelijke", type: "relationship", relationTo: "users", label: "Verantwoordelijke" },
    { name: "verwachting", type: "textarea", label: "Verwachting / afspraak" },
    { name: "doelLicenties", type: "number", min: 0, label: "Doel licenties" },
    { name: "volgendeActie", type: "text", label: "Volgende actie" },
    { name: "volgendeActieDeadline", type: "date", label: "Deadline volgende actie" },
    { name: "notities", type: "textarea", label: "Notities" },
    {
      name: "mijlpalen",
      type: "array",
      labels: { singular: "Mijlpaal", plural: "Mijlpalen" },
      fields: [
        { name: "type", type: "select", required: true, options: [
          { label: "Overeenkomst getekend", value: "overeenkomst" },
          { label: "Eerste gezamenlijke actie", value: "eerste_actie" },
          { label: "Eerste lead", value: "eerste_lead" },
          { label: "Eerste klant", value: "eerste_klant" },
          { label: "Evaluatie", value: "evaluatie" },
          { label: "Anders", value: "anders" },
        ] },
        { name: "datum", type: "date", required: true },
        { name: "toelichting", type: "text" },
      ],
    },
  ],
};
