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
    group: "Sales — systeem",
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
    // Sales-logica productiecorrectie 2026-08-16 (punt 1) — bijgehouden door
    // lib/sales/sync.ts se synchroniseerScholenBoard() aan het eind van elke
    // sync-run (cron ÉN handmatige "Sync nu"/"Sync met Monday"-knop, want
    // beide roepen exact diezelfde functie aan). readOnly: geen mens vult dit
    // handmatig in — puur bijschrift voor de sync-statusweergave op het
    // dashboard en Sales Overzicht.
    {
      name: "laatsteSyncOp",
      type: "date",
      label: "Laatste sync",
      admin: { readOnly: true, description: "Automatisch bijgewerkt na elke sync-run — niet handmatig aanpassen." },
    },
    {
      name: "laatsteSyncScholenVerwerkt",
      type: "number",
      label: "Scholen verwerkt (laatste sync)",
      admin: { readOnly: true },
    },
    {
      name: "laatsteSyncWijzigingen",
      type: "number",
      label: "Scholen met een gewijzigd CRM-kernveld (laatste sync)",
      admin: { readOnly: true, description: "Relatiestatus, Salesfase, Type school of Datum volgende actie afweek van de al lokaal bekende waarde." },
    },
    {
      name: "laatsteSyncFouten",
      type: "number",
      label: "Fouten (laatste sync)",
      admin: { readOnly: true },
    },
  ],
};
