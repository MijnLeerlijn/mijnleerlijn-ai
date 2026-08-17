import type { CollectionConfig } from "payload";
import { anyEditor, ownRecordAccess } from "../access/roles";

// Mijn Werk V1 (2026-08-17) — eerste werkelijk nieuwe collectie uit het
// goedgekeurde Mijn Werk-voorstel (architectuur §B/C/F): persoonlijke taken,
// een ZUSTER van sales-actions, nooit een uitbreiding daarvan — dat zou het
// verplichte school-veld en de Monday-write-back-logica raken, expliciet
// buiten scope ("geen wijzigingen aan bestaande Sales-functionaliteit").
// Verenigd met sales-actions/Monday-planningen uitsluitend op het leesmodel-
// niveau, zie lib/werk/agenda.ts se bepaalWerkAgenda().
//
// Eigenaar-gescoped (amendement bij goedkeuring): bewust GEEN teambreed
// zichtbaar zoals Sales dat is — ownRecordAccess (roles.ts) filtert read/
// update/delete server-side tot uitsluitend de eigen records, ook voor een
// admin. create is anyEditor; `eigenaar` wordt server-side gezet (zie
// hooks.beforeChange hieronder) en is nooit door de client te overschrijven
// (access.update: () => false op het veld zelf) — zelfde patroon als
// SalesActions.ts se createdBy.
//
// `datum` is BEWUST optioneel (amendement 1): een taak zonder datum is een
// volwaardige, verwachte uitkomst ("ongeplande taak"), geen tussenstap — dit
// voorkomt dat een latere Inbox-fase alsnog een migratie nodig heeft om
// ongeplande taken mogelijk te maken.
//
// `school` is optioneel en uitsluitend context (nooit een trigger): een taak
// met schoolcontext mag NOOIT automatisch een sales-actions-record of
// Monday-write-back veroorzaken — geen enkele hook hieronder doet dat, en
// geen andere Sales-code leest dit veld.
export const PersonalTasks: CollectionConfig = {
  slug: "personal-tasks",
  labels: { singular: "Eigen taak", plural: "Eigen taken" },
  admin: {
    useAsTitle: "titel",
    defaultColumns: ["titel", "datum", "status"],
    group: "Mijn Werk — systeem",
    description: "Persoonlijke taken — uitsluitend zichtbaar voor de eigenaar. Beheer via het Mijn Werk-dashboard (Mijn dag), niet deze lijst.",
  },
  access: {
    read: ownRecordAccess,
    create: anyEditor,
    update: ownRecordAccess,
    delete: ownRecordAccess,
  },
  fields: [
    { name: "titel", type: "text", required: true, label: "Titel" },
    { name: "beschrijving", type: "textarea", label: "Beschrijving" },
    {
      name: "datum",
      type: "date",
      label: "Datum",
      admin: { description: "Optioneel — een taak zonder datum blijft een ongeplande taak (zichtbaar in de Vandaag-tab onder 'Ongepland')." },
    },
    {
      name: "tijd",
      type: "text",
      label: "Tijd",
      admin: { description: "Vrije tekst, bv. '14:30' — uitsluitend weergave, telt niet mee in datumvergelijkingen." },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "open",
      label: "Status",
      options: [
        { label: "Open", value: "open" },
        { label: "Afgerond", value: "afgerond" },
        { label: "Vervallen", value: "vervallen" },
      ],
    },
    {
      name: "school",
      type: "relationship",
      relationTo: "sales-schools",
      label: "School (context)",
      admin: { description: "Uitsluitend ter context — veroorzaakt nooit een Sales-actie of Monday-write-back." },
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
