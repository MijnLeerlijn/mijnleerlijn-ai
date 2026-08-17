import type { CollectionConfig } from "payload";
import { anyEditor, ownRecordAccess } from "../access/roles";

// Mijn Werk Fase 2 (2026-08-17) — onthoudt uitsluitend de STATUS van een
// voorbereidingssignaal (zie lib/werk/voorbereiding.ts), nooit het
// agenda-event zelf: geen titel/beschrijving/deelnemers hier, uitsluitend een
// pointer (`eventId` + `eventStart`) plus wat de gebruiker ermee deed. Zonder
// dit zou "Ik ben al voorbereid" bij elke dashboard-lezing opnieuw
// verschijnen (het onderliggende Calendar-event wordt nooit lokaal
// bijgehouden, dus er is geen ander plek om dat te onthouden) — expliciet
// GEEN event-mirror-collectie, zie de opdracht.
//
// Eigenaar-gescoped zoals PersonalTasks.ts (create: anyEditor + hook, niet de
// dichtgetimmerde GoogleConnections-variant): anders dan de OAuth-callback
// gebeurt elke schrijfactie hier vanuit een echte, ingelogde
// dashboardsessie van de gebruiker zelf (een knop aanklikken), dus is er wél
// een bruikbare req.user om op te vertrouwen.
export const VoorbereidingSignalen: CollectionConfig = {
  slug: "voorbereiding-signalen",
  labels: { singular: "Voorbereidingssignaal", plural: "Voorbereidingssignalen" },
  admin: {
    useAsTitle: "eventId",
    defaultColumns: ["eventId", "school", "status", "eigenaar"],
    group: "Mijn Werk — systeem",
    description: "Status per agenda-voorbereidingssignaal (weggeklikt/uitgesteld/taak aangemaakt) — uitsluitend zichtbaar voor de eigenaar. Beheer via het Mijn Werk-dashboard, niet deze lijst.",
  },
  access: {
    read: ownRecordAccess,
    create: anyEditor,
    update: ownRecordAccess,
    delete: ownRecordAccess,
  },
  fields: [
    {
      name: "eventId",
      type: "text",
      required: true,
      label: "Agenda-event-ID",
      admin: { description: "Google Calendar event-ID — geen andere eventgegevens worden hier bewaard." },
    },
    {
      name: "eventStart",
      type: "date",
      required: true,
      label: "Startmoment van het event",
      admin: { description: "Uitsluitend voor weergave/diagnose — geen plannings- of matchlogica leest dit veld." },
    },
    {
      name: "school",
      type: "relationship",
      relationTo: "sales-schools",
      label: "Herkende school (context)",
      admin: { description: "Alleen gezet bij een betrouwbare match — zie lib/werk/school-matching.ts." },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "gesignaleerd",
      label: "Status",
      options: [
        { label: "Gesignaleerd", value: "gesignaleerd" },
        { label: "Ik ben al voorbereid", value: "gedempt" },
        { label: "Herinner morgen", value: "uitgesteld" },
        { label: "Voorbereidingstaak aangemaakt", value: "taak_aangemaakt" },
      ],
    },
    {
      name: "gekoppeldeTaak",
      type: "relationship",
      relationTo: "personal-tasks",
      label: "Gekoppelde voorbereidingstaak",
      admin: { description: "Gezet zodra 'Maak voorbereidingstaak', 'Herinner morgen' of een geaccepteerd AI-voorstel een taak aanmaakte." },
    },
    {
      name: "eigenaar",
      type: "relationship",
      relationTo: "users",
      required: true,
      access: { update: () => false },
      admin: { position: "sidebar", readOnly: true },
    },
  ],
  hooks: {
    beforeChange: [
      ({ operation, data, req }) => {
        if (operation === "create" && req.user) data.eigenaar = req.user.id;
        return data;
      },
    ],
  },
};
