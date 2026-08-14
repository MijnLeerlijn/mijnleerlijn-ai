import type { GlobalConfig } from "payload";
import { anyEditor } from "../access/roles";

// Sales-assistent V1 (2026-08-14) — accountbrede Sales-instellingen, zelfde
// toegangspatroon als HelpdeskInstellingen.ts. Puur functioneel-gedeelde
// instellingen (relevant voor iedereen die met Sales werkt); echt
// persoonlijke voorkeuren horen in Payload's eigen Preferences-API, niet
// hier — zie de sessie-analyse §19.
export const SalesInstellingen: GlobalConfig = {
  slug: "sales-instellingen",
  admin: {
    group: "Sales",
    description: "Accountbrede instellingen voor de Sales-assistent.",
  },
  access: {
    read: anyEditor,
    update: anyEditor,
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
  ],
};
