import type { CollectionConfig } from "payload";
import { adminOnly, anyEditor } from "../access/roles";
import { permissieOnly } from "../access/menu-permissions";

export const SalesPartners: CollectionConfig = {
  slug: "sales-partners",
  labels: { singular: "Sales-partner", plural: "Sales-partners" },
  admin: {
    useAsTitle: "naam",
    defaultColumns: ["naam", "status", "startDatum", "doelLicenties", "volgendeActieDeadline", "verantwoordelijke"],
    group: "Sales — systeem",
    description: "Partnerdossier voor commerciële afspraken, doelen, contactmomenten, acties en mijlpalen. Resultaten worden automatisch uit Monday berekend.",
  },
  access: {
    read: permissieOnly("sales.partners", anyEditor),
    create: permissieOnly("sales.partners", adminOnly),
    update: permissieOnly("sales.partners", adminOnly),
    delete: permissieOnly("sales.partners", adminOnly),
  },
  fields: [
    { name: "naam", type: "text", required: true, unique: true, label: "Partner", admin: { description: "Gebruik exact dezelfde naam als in Monday bij 'Binnengekomen via'." } },
    { name: "startDatum", type: "date", label: "Start samenwerking" },
    {
      name: "status",
      type: "select",
      defaultValue: "actief",
      label: "Status samenwerking",
      options: [
        { label: "Verkenning", value: "verkenning" },
        { label: "Actief", value: "actief" },
        { label: "On hold", value: "on_hold" },
        { label: "Gestopt", value: "gestopt" },
      ],
    },
    { name: "verantwoordelijke", type: "relationship", relationTo: "users", label: "Verantwoordelijke" },
    { name: "verwachting", type: "textarea", label: "Doel / verwachting samenwerking" },
    {
      type: "row",
      fields: [
        { name: "doelLicenties", type: "number", min: 0, label: "Doel licenties" },
        { name: "doelStartDatum", type: "date", label: "Doelperiode vanaf" },
        { name: "doelEindDatum", type: "date", label: "Doelperiode t/m" },
      ],
    },
    {
      name: "contactmomenten",
      type: "array",
      labels: { singular: "Contactmoment", plural: "Contactmomenten" },
      admin: { description: "Gesprekken, meetings, mails en andere relevante contactmomenten met deze partner." },
      fields: [
        { name: "datum", type: "date", required: true, label: "Datum" },
        { name: "type", type: "select", required: true, defaultValue: "overig", label: "Type", options: [
          { label: "Gesprek", value: "gesprek" },
          { label: "Meeting", value: "meeting" },
          { label: "E-mail", value: "email" },
          { label: "Actie / event", value: "actie_event" },
          { label: "Evaluatie", value: "evaluatie" },
          { label: "Overig", value: "overig" },
        ] },
        { name: "samenvatting", type: "textarea", required: true, label: "Samenvatting" },
      ],
    },
    {
      name: "acties",
      type: "array",
      labels: { singular: "Actie", plural: "Acties" },
      admin: { description: "Historie van concrete acties binnen de samenwerking. De eerstvolgende actie kan daarnaast bovenaan apart worden bijgehouden." },
      fields: [
        { name: "actie", type: "text", required: true, label: "Actie" },
        { name: "deadline", type: "date", label: "Deadline" },
        { name: "afgerond", type: "checkbox", defaultValue: false, label: "Afgerond" },
        { name: "afgerondOp", type: "date", label: "Afgerond op", admin: { condition: (_data, siblingData) => Boolean(siblingData?.afgerond) } },
      ],
    },
    { name: "volgendeActie", type: "text", label: "Volgende actie" },
    { name: "volgendeActieDeadline", type: "date", label: "Deadline volgende actie" },
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
    { name: "notities", type: "textarea", label: "Notities" },
  ],
};
