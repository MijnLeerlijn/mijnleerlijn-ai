import type { CollectionConfig } from "payload";
import { adminOnly } from "../access/roles";

// Startbegeleiding-ronde (2026-09-02, spec §E.1/§F) — actie 1, "Nog iets
// nodig voor de start": een lichte taak die beheer aan één trainer toewijst
// voor een school uit Monday (spec §D). Bewust GEEN local kopie van de
// school zelf — uitsluitend het Monday-ID + een naamsnapshot (zelfde patroon
// als AanvullendeTrainingen.ts: de school blijft leven in Monday, dit record
// is uitsluitend de taak zelf).
//
// Actie 2 ("Koppel een trainer", spec §E.2) heeft EXPRES geen eigen record
// hier of elders — dat is een directe, idempotente Monday-schrijving
// (lib/trainers/startbegeleiding.ts se koppelTrainerAanSchool) zonder lokale
// kopie van de school↔trainer-relatie (spec §H: "geen lokale kopie... alleen
// om dit mogelijk te maken" — de koppeling leeft uitsluitend in Monday se
// eigen trainer-kolom, precies zoals elke bestaande school↔trainer-relatie
// dat al doet).
//
// Zelfde sluit-collectie-patroon als AanvullendeTrainingen/TrainingVerslagen:
// create/update altijd () => false, uitsluitend server-side via
// overrideAccess:true door lib/trainers/startbegeleiding.ts (aanmaken/
// status wijzigen, ook de automatische afronding zodra de trainer na een
// gespreksdatum een verslag bevestigt — zie lib/trainers/verslag.ts).
export const StartActies: CollectionConfig = {
  slug: "start-acties",
  labels: { singular: "Startactie", plural: "Startacties" },
  admin: {
    useAsTitle: "actieType",
    defaultColumns: ["schoolNaam", "trainer", "actieType", "status", "deadline", "createdAt"],
    group: "Basis — Technisch beheer",
    description: "Startbegeleidingsacties (spec §E.1) — 'nog iets nodig voor de start'. Nooit rechtstreeks bewerken — uitsluitend server-side via lib/trainers/startbegeleiding.ts.",
  },
  access: {
    read: adminOnly,
    create: () => false,
    update: () => false,
    delete: adminOnly,
  },
  fields: [
    { name: "mondaySchoolId", type: "text", required: true, index: true, label: "Monday-ID school (Master Data)" },
    { name: "schoolNaam", type: "text", label: "School (naam, snapshot ten tijde van aanmaken)" },
    { name: "trainer", type: "relationship", relationTo: "trainer-accounts", required: true, index: true, label: "Trainer" },
    {
      name: "actieType",
      type: "select",
      required: true,
      label: "Actie",
      options: [
        { label: "Intake", value: "intake" },
        { label: "Laatste inhoudelijke gesprek", value: "laatste_gesprek" },
        { label: "Implementatieplan bespreken", value: "implementatieplan" },
        { label: "Curriculum bespreken", value: "curriculum" },
        { label: "Start voorbereiden", value: "start_voorbereiden" },
        { label: "Anders", value: "anders" },
      ],
    },
    { name: "instructie", type: "textarea", label: "Korte instructie (optioneel)", maxLength: 1000 },
    { name: "deadline", type: "date", required: true, index: true, label: "Deadline" },
    {
      name: "gespreksDatum",
      type: "date",
      label: "Concrete datum van gesprek/call (optioneel)",
      admin: { description: "Indien ingevuld: de trainer kan na deze datum een verslag maken (telefonisch of handmatig) voor dit gesprek — zie lib/trainers/startbegeleiding.ts se haalStartactieVoorMutatie." },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "open",
      index: true,
      label: "Status",
      options: [
        { label: "Open", value: "open" },
        { label: "Afgerond", value: "afgerond" },
        { label: "Vervallen", value: "vervallen" },
      ],
    },
    {
      name: "afgerondOp",
      type: "date",
      label: "Afgerond op",
      admin: { description: "Gezet zodra status naar 'afgerond' gaat — handmatig door beheer, of automatisch zodra de trainer het gekoppelde verslag bevestigt." },
    },
  ],
};
