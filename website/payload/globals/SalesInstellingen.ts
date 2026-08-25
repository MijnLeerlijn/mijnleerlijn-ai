import type { GlobalConfig } from "payload";
import { anyEditor } from "../access/roles";
import { permissieOnly } from "../access/menu-permissions";

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
    // Sales-logica productiecorrectie 2026-08-16 (punt 1/11) — board-
    // reconciliation + planningsherkenning zichtbaar maken in de
    // sync-samenvatting (SalesDashboardPaneel.tsx/SalesVandaagView.tsx),
    // zelfde "door sync bijgewerkt, nooit handmatig"-patroon als de 3
    // bestaande laatsteSync*-velden hierboven.
    {
      name: "laatsteSyncBestaandePlanningenHerkend",
      type: "number",
      label: "Bestaande planningen herkend (laatste sync)",
      admin: { readOnly: true, description: "Scholen met een geldige (niet-verlopen) Monday-vervolgdatum die deze sync-run als 'al gepland' zijn herkend." },
    },
    {
      name: "laatsteSyncScholenVanBoardGehaald",
      type: "number",
      label: "Scholen niet meer op Master Data-board (laatste sync)",
      admin: { readOnly: true, description: "Lokale scholen die deze sync-run niet meer voorkwamen op '1: Scholen (Master Data)' en daarom gedeactiveerd zijn." },
    },
    {
      name: "laatsteSyncVerouderdeVoorstellenGesloten",
      type: "number",
      label: "Verouderde AI-voorstellen gesloten (laatste sync)",
      admin: { readOnly: true, description: "Pending 'volgende actie'-voorstellen die deze sync-run superseded zijn omdat Monday inmiddels al een geldige vervolgdatum had." },
    },
  ],
};
