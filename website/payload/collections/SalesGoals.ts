import type { CollectionConfig } from "payload";
import { adminOnly, anyEditor } from "../access/roles";
import { permissieOnly } from "../access/menu-permissions";

export const SalesGoals: CollectionConfig = {
  slug: "sales-goals",
  labels: { singular: "Sales-doelstelling", plural: "Sales-doelstellingen" },
  admin: {
    useAsTitle: "naam",
    defaultColumns: ["naam", "startDatum", "eindDatum", "doelLicenties", "actief"],
    group: "Sales — systeem",
    description: "Commerciële doelperioden. Primair gestuurd op nieuwe licenties.",
  },
  access: {
    read: permissieOnly("sales.doelstellingen", anyEditor),
    create: permissieOnly("sales.doelstellingen", adminOnly),
    update: permissieOnly("sales.doelstellingen", adminOnly),
    delete: permissieOnly("sales.doelstellingen", adminOnly),
  },
  fields: [
    { name: "naam", type: "text", required: true, label: "Naam" },
    { name: "startDatum", type: "date", required: true, label: "Startdatum" },
    { name: "eindDatum", type: "date", required: true, label: "Einddatum" },
    { name: "doelLicenties", type: "number", required: true, min: 1, label: "Doel nieuwe licenties" },
    { name: "actief", type: "checkbox", defaultValue: true, label: "Actief" },
    { name: "notitie", type: "textarea", label: "Interne notitie" },
  ],
};
