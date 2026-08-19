import type { CollectionConfig } from "payload";
import { adminOnly } from "../access/roles";

// Traineromgeving V1, Ronde 2 (2026-08-19) — audittrail voor
// trainingsmutaties vanuit de traineromgeving (datum/status-schrijfback naar
// Monday). Structureel parallel aan payload/collections/SalesLogEvents.ts
// (zelfde audit-integriteitspatroon: create/update altijd () => false, alleen
// server-side via overrideAccess:true door lib/trainers/writeback.ts
// aangemaakt, nooit via de publieke REST-API, nooit achteraf bewerkbaar) —
// NIET letterlijk hergebruikt: sales-log-events.school/.actor zitten hard
// vast aan de collecties "sales-schools"/"users", die een Monday-only
// schoolidentiteit of een trainer-actor niet kunnen representeren. Een
// nieuwe, kleine collectie is hier de kleinste structureel juiste optie,
// geen tweede auditsysteem — het PATROON is hetzelfde, alleen de relaties
// kloppen nu voor deze context.
//
// `read: adminOnly` (niet anyEditor zoals Sales): trainer-operationele logs
// hebben geen editor-doelgroep zoals Sales die wel heeft — zelfde "kleinst
// mogelijke aanvalsoppervlak"-houding als TrainerAccounts.ts.
export const TrainerLogEvents: CollectionConfig = {
  slug: "trainer-log-events",
  labels: { singular: "Trainer-logregel", plural: "Trainer-logboek" },
  admin: {
    useAsTitle: "summary",
    defaultColumns: ["trainer", "veld", "status", "occurredAt", "summary"],
    group: "Basis — Technisch beheer",
    description: "Audittrail voor trainingsmutaties (datum/status) vanuit de traineromgeving — write-back naar Monday.",
  },
  access: {
    read: adminOnly,
    create: () => false,
    update: () => false,
    delete: adminOnly,
  },
  fields: [
    { name: "trainer", type: "relationship", relationTo: "trainer-accounts", required: true, label: "Trainer", index: true },
    { name: "occurredAt", type: "date", required: true, label: "Wanneer" },
    {
      name: "mondayCentraleTrainingId",
      type: "text",
      required: true,
      index: true,
      label: "Monday-ID centrale training",
      admin: { description: "Item-ID op board 4: Uitvoering (Trainingen) — geen lokale Payload-kopie van Monday-data, dus platte tekst, geen relatie." },
    },
    { name: "mondayTrainerboardItemId", type: "text", label: "Monday-ID trainerboard-item" },
    { name: "mondaySchoolId", type: "text", label: "Monday-ID school (Master Data)" },
    { name: "schoolNaam", type: "text", label: "School (naam, ten tijde van loggen)" },
    {
      name: "veld",
      type: "select",
      required: true,
      label: "Veld",
      options: [
        { label: "Datum", value: "datum" },
        { label: "Status", value: "status" },
        { label: "Logboek ingevuld", value: "logboek" },
        { label: "Trainerboard-spiegel (signaal, geen schrijfpoging)", value: "trainerboardMirrorSignaal" },
      ],
      admin: {
        description: "\"Trainerboard-spiegel\" is uitsluitend een datakwaliteitssignaal (numeric_mm5vkjzz wijkt af van de opgezochte waarde) — dat veld wordt nooit geschreven. \"Logboek ingevuld\" (Ronde 3) is de afrondingsvlag na een bevestigd trainingsverslag, zie lib/trainers/verslag.ts.",
      },
    },
    {
      name: "status",
      type: "select",
      required: true,
      label: "Status",
      options: [
        { label: "Geschreven", value: "geschreven" },
        { label: "Conflict", value: "conflict" },
        { label: "Mislukt", value: "mislukt" },
        { label: "Niet geactiveerd", value: "niet_geactiveerd" },
      ],
      admin: { description: "Zelfde vocabulaire als WriteBackStatus (lib/trainers/writeback.ts). Een trainerboardMirrorSignaal-regel gebruikt altijd \"conflict\" (een afwijking, geen schrijfpoging)." },
    },
    { name: "summary", type: "text", required: true, label: "Samenvatting" },
    { name: "payload", type: "json", label: "Technische context", admin: { description: "Gestructureerde snapshot (oude/nieuwe waarde, kolom-ID, record) — zelfde dataminimalisatie-eis als sales-log-events: geen overbodige ruwe Monday-tekst." } },
  ],
};
