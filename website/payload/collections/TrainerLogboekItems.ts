import type { CollectionConfig } from "payload";
import { adminOnly } from "../access/roles";

// Traineromgeving V2, Fase 1 (2026-08-28) — handmatig logboek: een trainer
// moet een contact/aantekening bij een school kunnen vastleggen die NIET aan
// een training gekoppeld hoeft te zijn (telefonisch contact, helpdeskcontact,
// overleg, algemene notitie). Structureel parallel aan TrainingVerslagen.ts/
// TrainerLogEvents.ts/TrainerAiLogEvents.ts (zelfde access-integriteitspatroon:
// create/update altijd () => false, uitsluitend server-side via
// overrideAccess:true door lib/trainers/logboek.ts geschreven, nooit via de
// publieke REST-API) — geen nieuw rechtenmodel, hetzelfde bewezen patroon.
//
// Bewust een EIGEN, nieuwe collectie i.p.v. TrainingVerslagen hergebruiken:
// een handmatig logboekitem heeft geen AI-structurering en geen
// concept-/bevestig-statusflow — het datamodel van TrainingVerslagen zou
// hier grotendeels ongebruikte velden meeslepen. Ook geen hergebruik van
// TrainerLogEvents (dat is systeemaudit voor de datum/status-schrijfback,
// geen trainer-geschreven inhoud).
//
// Upsell-ronde (2026-09-02, spec §B7/§B8) — het logboek is de ENIGE plek
// in deze trainer-/helpdesklaag die nog naar Monday schrijft (trainings-
// verslagen doen dat sinds deze ronde bewust niet meer, zie de doc-comment
// bij bevestigVerslag in lib/trainers/verslag.ts). mondayUpdateStatus/
// mondaySchoolUpdateId/mondayTrainingUpdateId volgen die ene schrijving —
// zie lib/trainers/logboek.ts se schrijfLogboekUpdateNaarMonday.
//
// schoolNaam/trainingNaam zijn snapshots (zelfde reden als TrainingVerslagen.ts
// se schoolNaam/trainingNaam): geen lokale Payload-kopie van Monday-data, dus
// platte tekst i.p.v. een relatie — de opdracht vraagt expliciet om historie
// leesbaar te houden als Monday-data verandert.
export const TrainerLogboekItems: CollectionConfig = {
  slug: "trainer-logboek-items",
  labels: { singular: "Logboekitem", plural: "Logboekitems" },
  admin: {
    useAsTitle: "schoolNaam",
    defaultColumns: ["trainer", "type", "schoolNaam", "occurredAt", "trainingNaam"],
    group: "Basis — Technisch beheer",
    description: "Handmatige logboekitems (contact/aantekening) van trainers, los van de trainingsverslagflow. Nooit rechtstreeks bewerken — uitsluitend server-side via lib/trainers/logboek.ts.",
  },
  access: {
    read: adminOnly,
    create: () => false,
    update: () => false,
    delete: adminOnly,
  },
  fields: [
    { name: "trainer", type: "relationship", relationTo: "trainer-accounts", required: true, label: "Trainer", index: true },
    {
      name: "mondaySchoolId",
      type: "text",
      required: true,
      index: true,
      label: "Monday-ID school (Master Data)",
      admin: { description: "Server-side afgeleid/geverifieerd via haalSchoolDetail — nooit ongecontroleerd door de client aangeleverd." },
    },
    { name: "schoolNaam", type: "text", label: "School (naam, snapshot ten tijde van vastleggen)" },
    {
      name: "type",
      type: "select",
      required: true,
      label: "Type",
      options: [
        { label: "Telefonisch", value: "telefonisch" },
        { label: "Helpdesk", value: "helpdesk" },
        { label: "Overleg", value: "overleg" },
        { label: "Notitie", value: "notitie" },
        { label: "Overig", value: "overig" },
      ],
    },
    {
      name: "occurredAt",
      type: "date",
      required: true,
      index: true,
      label: "Datum/tijd",
      admin: { description: "Wanneer het contact/de aantekening plaatsvond — door de trainer zelf gekozen, kan afwijken van het moment van vastleggen (createdAt)." },
    },
    { name: "tekst", type: "textarea", required: true, maxLength: 4000, label: "Notitie" },
    {
      name: "mondayTrainingId",
      type: "text",
      label: "Monday-ID training (optioneel)",
      admin: { description: "Alleen gevuld als de trainer dit item expliciet aan een training koppelde — server-side geverifieerd via haalTrainingVoorMutatie. Leeg = niet aan een training gekoppeld." },
    },
    { name: "trainingNaam", type: "text", label: "Training (naam, snapshot — alleen bij mondayTrainingId)" },
    {
      name: "mondayUpdateStatus",
      type: "select",
      required: true,
      defaultValue: "niet_verzonden",
      label: "Monday-schrijfstatus",
      options: [
        { label: "Niet verzonden", value: "niet_verzonden" },
        { label: "Geschreven", value: "geschreven" },
        { label: "Mislukt", value: "mislukt" },
        { label: "Niet geactiveerd (TRAINER_MONDAY_LOGBOEK_ENABLED)", value: "niet_geactiveerd" },
      ],
      admin: { description: "Server-side bijgehouden, nooit door de client gezet. 'Mislukt' blokkeert het lokale logboekitem nooit — het item bestaat en telt sowieso, de Monday-Update is een aanvulling erbovenop." },
    },
    { name: "mondaySchoolUpdateId", type: "text", label: "Monday-Update-ID (school)", admin: { description: "ID van de geschreven Update op het school-item, indien geschreven." } },
    { name: "mondayTrainingUpdateId", type: "text", label: "Monday-Update-ID (training)", admin: { description: "ID van de geschreven Update op het training-item — alleen relevant bij mondayTrainingId, en alleen bij een échte Monday-training (geen aanvullende training)." } },
  ],
};
