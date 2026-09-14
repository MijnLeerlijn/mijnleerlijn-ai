import type { GlobalConfig } from "payload";
import { anyEditor } from "../access/roles";
import { permissieOnly } from "../access/menu-permissions";

export const SalesInstellingen: GlobalConfig = {
  slug: "sales-instellingen",
  admin: {
    group: "Sales — systeem",
    description: "Accountbrede instellingen voor de Sales-assistent en het commerciële dashboard.",
  },
  access: {
    read: permissieOnly("sales.instellingen", anyEditor),
    update: permissieOnly("sales.instellingen", anyEditor),
  },
  fields: [
    {
      name: "standaardFollowUpTermijnDagen",
      type: "number",
      defaultValue: 10,
      label: "Standaard follow-up-termijn (dagen)",
      admin: { description: "Uitgangspunt voor AI-voorstellen zonder expliciete afspraak in de contactgeschiedenis." },
    },
    {
      name: "voorkeurskanaal",
      type: "select",
      defaultValue: "mail",
      label: "Voorkeurskanaal",
      options: [
        { label: "Mail", value: "mail" },
        { label: "Telefoon", value: "telefoon" },
        { label: "In persoon", value: "in_persoon" },
        { label: "Anders", value: "anders" },
      ],
    },
    {
      name: "licentiesPerSchoolEquivalent",
      type: "number",
      defaultValue: 200,
      min: 1,
      label: "Licenties per school-equivalent",
      admin: { description: "Centrale rekenfactor voor commerciële doelen. Standaard: 200 licenties = 1 gemiddelde school." },
    },
    { name: "laatsteSyncOp", type: "date", label: "Laatste sync", admin: { readOnly: true, description: "Automatisch bijgewerkt na elke sync-run." } },
    { name: "laatsteSyncScholenVerwerkt", type: "number", label: "Scholen verwerkt (laatste sync)", admin: { readOnly: true } },
    { name: "laatsteSyncWijzigingen", type: "number", label: "Scholen met een gewijzigd CRM-kernveld (laatste sync)", admin: { readOnly: true } },
    { name: "laatsteSyncFouten", type: "number", label: "Fouten (laatste sync)", admin: { readOnly: true } },
    { name: "laatsteSyncBestaandePlanningenHerkend", type: "number", label: "Bestaande planningen herkend (laatste sync)", admin: { readOnly: true } },
    { name: "laatsteSyncScholenVanBoardGehaald", type: "number", label: "Scholen niet meer op Master Data-board (laatste sync)", admin: { readOnly: true } },
    { name: "laatsteSyncVerouderdeVoorstellenGesloten", type: "number", label: "Verouderde AI-voorstellen gesloten (laatste sync)", admin: { readOnly: true } },
  ],
};
