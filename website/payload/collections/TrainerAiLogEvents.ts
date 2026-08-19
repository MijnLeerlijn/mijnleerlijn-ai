import type { CollectionConfig } from "payload";
import { adminOnly } from "../access/roles";

// Traineromgeving V1, Ronde 2 afronding — Trainer-AI (2026-08-19) —
// lichtgewicht audittrail voor de nieuwe, adviserende Trainer-AI ("Vraag
// over deze school" / "Vraag" op het dashboard). Structureel parallel aan
// payload/collections/TrainerLogEvents.ts (zelfde access-integriteitspatroon:
// create/update altijd () => false, uitsluitend server-side via
// overrideAccess:true door lib/trainers/trainer-chat.ts aangemaakt) — NIET
// letterlijk hergebruikt: TrainerLogEvents se veld/status-vocabulaire
// (datum/status/geschreven/conflict/...) is specifiek voor de
// datum/status-schrijfback naar Monday en past niet bij een read-only
// AI-vraag-gebeurtenis. Een nieuwe, kleine collectie is hier de kleinste
// structureel juiste optie, geen tweede auditsysteem.
//
// Bewuste dataminimalisatie (opdrachtseis "audit/logging zonder volledige
// gevoelige context onnodig op te slaan"): NOOIT de vraagtekst of het
// AI-antwoord zelf opslaan (die kunnen schoollogboek-/Monday-inhoud citeren)
// — uitsluitend een lengte-signaal en het gekozen contextbereik, genoeg om
// gebruik/misbruik/foutpercentage te kunnen zien zonder gevoelige inhoud te
// dupliceren.
export const TrainerAiLogEvents: CollectionConfig = {
  slug: "trainer-ai-log-events",
  labels: { singular: "Trainer-AI-logregel", plural: "Trainer-AI-logboek" },
  admin: {
    useAsTitle: "schoolNaam",
    defaultColumns: ["trainer", "contextSoort", "schoolNaam", "uitkomst", "createdAt"],
    group: "Basis — Technisch beheer",
    description: "Audittrail voor de adviserende Trainer-AI (Vraag-blok dashboard/schooldetail) — nooit vraag-/antwoordtekst zelf, uitsluitend gebruikssignaal.",
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
      name: "contextSoort",
      type: "select",
      required: true,
      label: "Contextsoort",
      options: [
        { label: "Eén school", value: "school" },
        { label: "Alle scholen (dashboard)", value: "algemeen" },
      ],
    },
    { name: "mondaySchoolId", type: "text", label: "Monday-ID school (Master Data)", admin: { description: "Alleen gevuld bij contextSoort \"school\" — geen lokale Payload-kopie van Monday-data, dus platte tekst, geen relatie." } },
    { name: "schoolNaam", type: "text", label: "School (naam, ten tijde van loggen)" },
    {
      name: "uitkomst",
      type: "select",
      required: true,
      label: "Uitkomst",
      options: [
        { label: "Beantwoord", value: "beantwoord" },
        { label: "Mislukt", value: "mislukt" },
      ],
    },
    { name: "vraagLengte", type: "number", required: true, label: "Lengte van de vraag (tekens)", admin: { description: "Uitsluitend het aantal tekens — nooit de vraag zelf." } },
  ],
};
