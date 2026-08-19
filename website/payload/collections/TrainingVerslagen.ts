import type { CollectionConfig } from "payload";
import { adminOnly } from "../access/roles";

// Traineromgeving V1, Ronde 3 (2026-08-19) — trainingsverslag: vrije
// trainerinvoer -> AI-structureringsvoorstel -> trainerbevestigde
// definitieve tekst -> identieke Monday Update op zowel de training als het
// centrale schoolitem (Master Data) -> pas dan status Gedaan + logboek-
// vlaggen op beide trainingrecords.
//
// Waarom deze collectie NOODZAKELIJK is (niet "want het kan"): Monday zelf
// kent geen concept-status en geen transactie over twee Updates. Zonder een
// lokale rij die per kant (training/school) bijhoudt of de Update al
// geschreven is — inclusief het teruggekregen Monday Update-ID — is veilige
// retry zonder een Update te dupliceren principieel onmogelijk: er is
// nergens anders om "is dit al gebeurd?" aan te vragen. Dit is dus de enige
// plek waar de idempotentiegarantie kan wonen, geen dataverzameling om de
// dataverzameling.
//
// Access is BEWUST letterlijk hetzelfde blok als TrainerLogEvents/
// TrainerAiLogEvents (create/update altijd () => false, uitsluitend
// server-side via overrideAccess:true door lib/trainers/verslag.ts) — hier
// nog belangrijker dan bij die twee pure auditcollecties: deze rij draagt
// idempotentiestatus (trainingUpdateStatus/*MondayId). Een admin die dit via
// /admin los van lib/trainers/verslag.ts zou kunnen wijzigen, kan lokale
// staat en Monday-werkelijkheid uit elkaar laten lopen (bv. trainingUpdate
// Status op "geschreven" zetten zonder dat er ooit een Update bestond).
//
// Geen aparte auditcollectie ernaast: dit record IS zijn eigen audittrail
// (bevat al elk veld dat de opdracht vraagt — trainer/school/training/
// trainerboard-item/verslag-ID (=dit document-ID)/AI-ja-nee/bevestigingstijd
// /beide Update-resultaten/afrondingsresultaat). Een tweede logcollectie zou
// de volledige verslagtekst nogmaals moeten dupliceren om nuttig te zijn —
// precies wat de opdracht afraadt.
//
// Unieke index op (trainer, mondayTrainingId): Payload-config kent geen
// samengestelde uniciteit, zelfde reden/vorm als MailSignalen.ts se
// (eigenaar, gmailMessageId). Dit is de echte atomiciteitsgarantie tegen
// twee bijna-gelijktijdige eerste concept-autosaves voor dezelfde training
// (zonder deze index: tot dubbel zoveel Monday-Updates, niet alleen "even
// twee rijen"). lib/trainers/verslag.ts doet een find-or-create op exact dit
// paar, met een generieke catch-en-herleid bij een unique-violation.
export const TrainingVerslagen: CollectionConfig = {
  slug: "training-verslagen",
  labels: { singular: "Trainingsverslag", plural: "Trainingsverslagen" },
  admin: {
    useAsTitle: "trainingNaam",
    defaultColumns: ["trainer", "schoolNaam", "trainingNaam", "status", "updatedAt"],
    group: "Basis — Technisch beheer",
    description: "Concept/bevestigde trainingsverslagen — idempotentiestatus voor de dubbele Monday Update-write (training + centraal schoollogboek). Nooit rechtstreeks bewerken: verstoort de synchronisatie met Monday.",
  },
  access: {
    read: adminOnly,
    create: () => false,
    update: () => false,
    delete: adminOnly,
  },
  fields: [
    { name: "trainer", type: "relationship", relationTo: "trainer-accounts", required: true, label: "Trainer", index: true },
    { name: "mondayTrainingId", type: "text", required: true, label: "Monday-ID centrale training", admin: { description: "Server-side afgeleid via haalTrainingVoorMutatie — nooit door de client aangeleverd." } },
    { name: "mondaySchoolId", type: "text", required: true, label: "Monday-ID school (Master Data)" },
    { name: "mondayTrainerboardItemId", type: "text", required: true, label: "Monday-ID trainerboard-item" },
    { name: "schoolNaam", type: "text", label: "School (naam, ten tijde van opstellen)" },
    { name: "trainingNaam", type: "text", label: "Training (naam, ten tijde van opstellen)" },
    {
      name: "trainerInvoer",
      type: "textarea",
      maxLength: 4000,
      label: "Oorspronkelijke trainerinvoer",
      admin: { description: "De vrije tekst zoals de trainer die typte, apart bewaard van de definitieve tekst zodat 'terug naar oorspronkelijke invoer' mogelijk blijft." },
    },
    {
      name: "definitieveTekst",
      type: "textarea",
      maxLength: 8000,
      label: "Definitieve tekst",
      admin: { description: "De bron van waarheid voor de Monday-schrijving — exact deze tekst gaat (identiek) naar beide Updates. Na een handmatige trainerwijziging wordt hier nooit meer automatisch AI overheen gehaald." },
    },
    { name: "aiGegenereerd", type: "checkbox", defaultValue: false, label: "AI gebruikt bij opstellen" },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "concept",
      label: "Status",
      options: [
        { label: "Concept", value: "concept" },
        { label: "Gedeeltelijk opgeslagen", value: "gedeeltelijk" },
        { label: "Bevestigd (beide Updates geschreven)", value: "bevestigd" },
        { label: "Voltooid (incl. status/logboek-afronding)", value: "voltooid" },
      ],
    },
    {
      name: "trainingUpdateStatus",
      type: "select",
      required: true,
      defaultValue: "niet_verzonden",
      label: "Training-Update — status",
      options: [
        { label: "Niet verzonden", value: "niet_verzonden" },
        { label: "Bezig (geclaimd)", value: "bezig" },
        { label: "Geschreven", value: "geschreven" },
        { label: "Mislukt", value: "mislukt" },
        { label: "Nog niet actief", value: "niet_geactiveerd" },
      ],
      admin: { description: "'Bezig' is een kortstondige claim (zie trainingUpdateClaimedAt) — nooit een eindstatus. Alleen server-side via een atomische conditional UPDATE gezet, nooit hier handmatig." },
    },
    {
      name: "trainingUpdateClaimedAt",
      type: "date",
      label: "Training-Update — geclaimd op",
      admin: { description: "Alleen relevant zolang trainingUpdateStatus='bezig'. Een claim ouder dan de leasetermijn (lib/trainers/verslag.ts) wordt door een volgende poging als verweesd beschouwd en overschreven." },
    },
    {
      name: "trainingUpdateMondayId",
      type: "text",
      label: "Training-Update — Monday Update-ID",
      admin: { description: "Zodra gevuld: NOOIT opnieuw schrijven — dit veld IS de idempotentiegarantie voor deze kant." },
    },
    {
      name: "schoolUpdateStatus",
      type: "select",
      required: true,
      defaultValue: "niet_verzonden",
      label: "School-Update — status",
      options: [
        { label: "Niet verzonden", value: "niet_verzonden" },
        { label: "Bezig (geclaimd)", value: "bezig" },
        { label: "Geschreven", value: "geschreven" },
        { label: "Mislukt", value: "mislukt" },
        { label: "Nog niet actief", value: "niet_geactiveerd" },
      ],
      admin: { description: "'Bezig' is een kortstondige claim (zie schoolUpdateClaimedAt) — nooit een eindstatus. Alleen server-side via een atomische conditional UPDATE gezet, nooit hier handmatig." },
    },
    {
      name: "schoolUpdateClaimedAt",
      type: "date",
      label: "School-Update — geclaimd op",
      admin: { description: "Alleen relevant zolang schoolUpdateStatus='bezig'. Een claim ouder dan de leasetermijn (lib/trainers/verslag.ts) wordt door een volgende poging als verweesd beschouwd en overschreven." },
    },
    {
      name: "schoolUpdateMondayId",
      type: "text",
      label: "School-Update — Monday Update-ID",
      admin: { description: "Zodra gevuld: NOOIT opnieuw schrijven — dit veld IS de idempotentiegarantie voor deze kant." },
    },
    {
      name: "afrondingResultaat",
      type: "json",
      label: "Afrondingsresultaat (status/logboek-writeback)",
      admin: { description: "Het volledige, ongewijzigde TrainingWriteBackResultaat van de afrondingsstap (lib/trainers/writeback.ts) — alleen gezet zodra beide Updates geschreven zijn." },
    },
    { name: "bevestigdOp", type: "date", label: "Definitief bevestigd op" },
  ],
  indexes: [{ fields: ["trainer", "mondayTrainingId"], unique: true }],
};
