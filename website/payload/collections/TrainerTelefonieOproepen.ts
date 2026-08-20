import type { CollectionConfig } from "payload";
import { adminOnly } from "../access/roles";

// Traineromgeving V1, Ronde 3.5 (2026-08-25) — telefonische verslaglegging:
// call-state + admindiagnostiek voor één binnenkomend telefoongesprek (spec
// §18/§23/§27). BEWUST GEEN tweede bron van waarheid voor de verslagtekst
// zelf — zodra transcriptie+AI-structurering slagen, leeft die uitsluitend in
// training-verslagen.trainerInvoer/definitieveTekst (via verslag hieronder
// gekoppeld); dit record bevat nooit de volledige transcriptietekst of audio
// (spec §9: "geen volledige transcripties in gewone logs", "geen audio in
// auditlogs") — uitsluitend tellingen/verwijzingen.
//
// Toch MUTABEL (anders dan TrainerLogEvents/TrainerAiLogEvents, die
// append-only audit zijn): een gesprek doorloopt meerdere webhook-callbacks
// (inkomend -> trainingkeuze -> opnamestatus) die DEZELFDE rij bijwerken.
// create/update staan hier daarom BEWUST net als training-verslagen op
// () => false — uitsluitend server-side via overrideAccess:true door
// lib/trainers/telefonie/oproep-state.ts, nooit via de publieke REST-API.
// Statusovergangen bij de opname-callback gaan via een atomische conditionele
// UPDATE (zelfde bewezen patroon als lib/trainers/verslag.ts se
// claimUpdateSlot) — voorkomt dat een dubbele/herhaalde providerwebhook
// tweemaal een concept aanmaakt (spec §12/§18/§24).
export const TrainerTelefonieOproepen: CollectionConfig = {
  slug: "trainer-telefonie-oproepen",
  labels: { singular: "Telefonie-oproep", plural: "Telefonie-oproepen" },
  admin: {
    useAsTitle: "providerCallId",
    defaultColumns: ["trainer", "status", "gekozenSchoolNaam", "gekozenTrainingNaam", "ontvangenOp", "foutcode"],
    group: "Basis — Technisch beheer",
    description:
      "Call-state en diagnostiek voor telefonisch ingesproken trainingsverslagen (Ronde 3.5). Bevat nooit de volledige transcriptietekst of audio — die staat (indien geslaagd) in het gekoppelde trainingsverslag. Nooit rechtstreeks bewerken.",
  },
  access: {
    read: adminOnly,
    create: () => false,
    update: () => false,
    delete: adminOnly,
  },
  fields: [
    { name: "provider", type: "select", required: true, defaultValue: "twilio", label: "Provider", options: [{ label: "Twilio", value: "twilio" }] },
    { name: "providerCallId", type: "text", required: true, unique: true, index: true, label: "Provider-call-ID", admin: { description: "Twilio CallSid — de idempotentiesleutel voor dit hele gesprek." } },
    { name: "trainer", type: "relationship", relationTo: "trainer-accounts", label: "Trainer", index: true, admin: { description: "Leeg zolang het nummer niet (nog) matcht — zie foutcode." } },
    { name: "ruwNummer", type: "text", label: "Caller-ID (ruw, zoals gerapporteerd)" },
    { name: "genormaliseerdNummer", type: "text", label: "Genormaliseerd nummer (E.164)" },
    { name: "nummerVerborgen", type: "checkbox", defaultValue: false, label: "Nummer verborgen/anoniem" },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "ontvangen",
      label: "Status",
      options: [
        { label: "Ontvangen", value: "ontvangen" },
        { label: "Trainer herkend", value: "trainer_herkend" },
        { label: "Training gekozen", value: "training_gekozen" },
        { label: "Opname verwacht", value: "opname_verwacht" },
        { label: "Opname ontvangen", value: "opname_ontvangen" },
        { label: "Transcriptie bezig", value: "transcriptie_bezig" },
        { label: "Concept klaar", value: "concept_klaar" },
        { label: "Mislukt", value: "mislukt" },
      ],
    },
    {
      name: "foutcode",
      type: "select",
      label: "Foutcode (indien mislukt)",
      options: [
        { label: "Onbekend nummer", value: "onbekend_nummer" },
        { label: "Nummer verborgen", value: "nummer_verborgen" },
        { label: "Trainer niet in pilot", value: "trainer_niet_pilot" },
        { label: "Nummer gekoppeld aan meerdere trainers (dataconflict)", value: "conflict_meerdere_trainers" },
        { label: "Geen recente training gevonden", value: "geen_training_gevonden" },
        { label: "Geen geldige keuze gemaakt", value: "geen_keuze_gemaakt" },
        { label: "Opname mislukt/leeg", value: "opname_mislukt" },
        { label: "Transcriptie mislukt", value: "transcriptie_mislukt" },
        { label: "AI-structurering mislukt", value: "structurering_mislukt" },
        { label: "Database tijdelijk onbereikbaar", value: "database_onbereikbaar" },
        { label: "Onbekende fout", value: "onbekende_fout" },
      ],
    },
    { name: "foutmelding", type: "text", label: "Foutmelding (technisch, alleen voor beheer)" },
    {
      name: "kandidaatTrainingen",
      type: "json",
      label: "Voorgelegde trainingkandidaten (snapshot)",
      admin: { description: "Wat de trainer telefonisch te kiezen kreeg (id/naam/school/datum) — uitsluitend diagnostiek, geen bron van waarheid." },
    },
    { name: "gekozenMondayTrainingId", type: "text", label: "Gekozen training — Monday-ID" },
    { name: "gekozenMondaySchoolId", type: "text", label: "Gekozen training — school-ID" },
    { name: "gekozenMondayTrainerboardItemId", type: "text", label: "Gekozen training — trainerboard-item-ID" },
    { name: "gekozenSchoolNaam", type: "text", label: "Gekozen training — school (naam)" },
    { name: "gekozenTrainingNaam", type: "text", label: "Gekozen training — naam" },
    { name: "recordingProviderId", type: "text", index: true, label: "Provider-opname-ID", admin: { description: "Twilio RecordingSid — tweede idempotentiesleutel, specifiek voor de opnameverwerkingsstap." } },
    { name: "recordingDuurSeconden", type: "number", label: "Opnameduur (seconden)" },
    { name: "transcriptieLengte", type: "number", label: "Transcriptielengte (tekens)", admin: { description: "Uitsluitend de lengte, nooit de tekst zelf — spec §9 dataminimalisatie." } },
    // Kale naam (geen "Id"-suffix) — zelfde reden als training-verslagen se
    // telefonieOproep-veld: Payload-postgres se FK-kolomconventie is ALTIJD
    // snake_case(veldnaam)+"_id" zonder uitzondering, dus "verslagId" zou
    // kolom verslag_id_id verwachten (bestaat niet); "verslag" resolveert
    // correct naar de al-bestaande migratiekolom verslag_id.
    { name: "verslag", type: "relationship", relationTo: "training-verslagen", label: "Resulterend trainingsverslag" },
    { name: "ontvangenOp", type: "date", required: true, label: "Ontvangen op" },
    { name: "afgerondOp", type: "date", label: "Afgerond op (concept klaar of mislukt)" },
  ],
};
