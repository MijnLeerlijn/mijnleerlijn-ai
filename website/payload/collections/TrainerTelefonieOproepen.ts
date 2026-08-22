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
    // Admin-zichtbaarheid (2026-08-25) — uitgebreid met foutmelding + verslag
    // (was al wel op de rij aanwezig, maar niet in de standaardlijst): "in
    // het overzicht wil ik zien... foutcode/foutmelding als er iets misgaat...
    // of er uiteindelijk een conceptverslag is aangemaakt".
    defaultColumns: [
      "trainer",
      "ontvangenOp",
      "gekozenSchoolNaam",
      "gekozenTrainingNaam",
      "status",
      "heropnamePogingen",
      "transcriptiePogingen",
      "foutcode",
      "foutmelding",
      "opnameVerwijderdOp",
      "verslag",
    ],
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
    {
      name: "provider",
      type: "select",
      required: true,
      defaultValue: "telnyx",
      label: "Provider",
      // "twilio" bewust nog in de opties (nooit een enum-waarde stilzwijgend
      // laten verdwijnen, zelfde regel als Gate 1 se status/foutcode-enums) —
      // de telefoniepilot is nog niet gestart geweest (TRAINER_TELEFONIE_ENABLED
      // stond nooit aan), dus er bestaan geen echte rijen met provider=twilio,
      // maar de historische optie blijft veilig zichtbaar/kiesbaar in de admin.
      options: [
        { label: "Telnyx", value: "telnyx" },
        { label: "Twilio (uitgefaseerd, zie opleverrapport providermigratie)", value: "twilio" },
      ],
    },
    {
      name: "providerCallId",
      type: "text",
      required: true,
      unique: true,
      index: true,
      label: "Provider-call-ID",
      admin: { description: "De providerspecifieke identifier voor dit hele gesprek (bij Telnyx: call_control_id) — de idempotentiesleutel." },
    },
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
        {
          label: "Transcriptie mislukt (herstelbaar — automatische retry gepland)",
          value: "transcriptie_mislukt_herstelbaar",
        },
        { label: "Concept klaar", value: "concept_klaar" },
        // V1-afronding (2026-08-26, spec §7/§17) — expliciet GEEN technische
        // fout: een ANDER gesprek (of de portal) had deze training al vast.
        // Bewust een eigen status i.p.v. foutcode="transcriptie_mislukt" of
        // status="mislukt" — zie het opleverrapport voor de volledige
        // race-afhandeling (lib/trainers/verslag.ts se upsertConcept).
        { label: "Verslag bestaat al (geen technische fout)", value: "verslag_bestaat_al" },
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
        { label: "Transcriptie mislukt (max. pogingen bereikt)", value: "transcriptie_mislukt" },
        { label: "Bewaartermijn verstreken vóór transcriptie lukte", value: "bewaartermijn_verstreken" },
        { label: "AI-structurering mislukt", value: "structurering_mislukt" },
        { label: "Database tijdelijk onbereikbaar", value: "database_onbereikbaar" },
        { label: "Onbekende fout", value: "onbekende_fout" },
      ],
    },
    { name: "foutmelding", type: "text", label: "Foutmelding (technisch, alleen voor beheer)" },
    {
      // Admin-zichtbaarheid (2026-08-25) — zie
      // payload/components/RetryTelefonieButton.tsx en
      // lib/trainers/telefonie/gesprek.ts se verwerkTelefonieHandmatigeRetry.
      // Puur presentationeel `type: "ui"`-veld (zelfde patroon als
      // GmailConnection.ts se syncAction/analyzeAction), geen eigen
      // dataveld/migratie nodig.
      name: "retryAction",
      type: "ui",
      label: "Handmatige retry",
      admin: {
        components: {
          Field: "@/payload/components/RetryTelefonieButton#RetryTelefonieButton",
        },
      },
    },
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
    {
      name: "recordingProviderId",
      type: "text",
      index: true,
      label: "Provider-opname-ID",
      admin: {
        description:
          "Bij Telnyx: het call_leg_id (niet een los recording_id — dat ontbreekt op het call.recording.saved-webhookevent zelf, hard bevestigd via Telnyx' eigen SDK-broncode). Wordt gebruikt om de bijbehorende opname op te zoeken via GET /v2/recordings?filter[call_leg_id]=... vlak vóór ophalen/verwijderen (lib/trainers/telefonie/telnyx-provider.ts).",
      },
    },
    {
      name: "opnameOphaalReferentie",
      type: "text",
      label: "Opname-ophaalreferentie (provider-URL)",
      admin: {
        description:
          "De providerreferentie om de opname opnieuw op te halen bij een automatische retry (spec: transcriptieherstel) — bij Telnyx hetzelfde call_leg_id als recordingProviderId hierboven, nooit een kale/publiek bruikbare URL op zichzelf (download vereist nog altijd providerauthenticatie, bij Telnyx een Bearer-API-key). Uitsluitend gebruikt door de onderhoudsronde (lib/trainers/telefonie/gesprek.ts se verwerkTelefonieOnderhoud).",
      },
    },
    { name: "recordingDuurSeconden", type: "number", label: "Opnameduur (seconden)" },
    { name: "transcriptieLengte", type: "number", label: "Transcriptielengte (tekens)", admin: { description: "Uitsluitend de lengte, nooit de tekst zelf — spec §9 dataminimalisatie." } },
    {
      name: "transcriptiePogingen",
      type: "number",
      defaultValue: 0,
      label: "Transcriptiepogingen",
      admin: { description: "Aantal keer dat ophalen+transcriberen geprobeerd is (initiële poging + automatische retries). Begrensd, zie MAX_TRANSCRIPTIE_POGINGEN in gesprek.ts." },
    },
    {
      // V1-afronding (2026-08-26, spec §10/§11/§17) — hoe vaak de trainer de
      // opname via '*' heeft afgewezen en opnieuw is begonnen ("opnieuw
      // inspreken" uit spec §17 — bewust een teller, geen eigen status, zelfde
      // precedent als transcriptiePogingen hierboven: functioneel blijft de
      // oproep gewoon 'opname_verwacht'). Begrensd, zie MAX_HEROPNAME_POGINGEN
      // in gesprek.ts. Ook de client_state-waarde die telnyx-provider.ts op
      // elk record_start meegeeft, zodat een inmiddels afgewezen opname-
      // webhook herkenbaar/negeerbaar is (spec §12/§18).
      name: "heropnamePogingen",
      type: "number",
      defaultValue: 0,
      label: "Heropnamepogingen (via *)",
      admin: { description: "Aantal keer dat de trainer de opname via '*' heeft afgewezen en opnieuw is begonnen. Begrensd, zie MAX_HEROPNAME_POGINGEN in gesprek.ts." },
    },
    {
      name: "volgendeTranscriptiepoging",
      type: "date",
      label: "Volgende automatische retry gepland op",
      admin: { description: "Leeg zodra de zaak is afgerond (concept klaar) of definitief is opgegeven. Alleen gezet terwijl status 'Transcriptie mislukt (herstelbaar)' is." },
    },
    {
      name: "opnameVerwijderdOp",
      type: "date",
      label: "Opname verwijderd bij provider op",
      admin: {
        description:
          "Leeg zolang de audio nog bij de provider staat (bv. tijdens herstelbare retries) — admin-zichtbaarheidseis: dit veld is DE plek om te zien of een tijdelijk mislukte verwerking nog audio heeft staan of al is opgeruimd.",
      },
    },
    // Kale naam (geen "Id"-suffix) — zelfde reden als training-verslagen se
    // telefonieOproep-veld: Payload-postgres se FK-kolomconventie is ALTIJD
    // snake_case(veldnaam)+"_id" zonder uitzondering, dus "verslagId" zou
    // kolom verslag_id_id verwachten (bestaat niet); "verslag" resolveert
    // correct naar de al-bestaande migratiekolom verslag_id.
    { name: "verslag", type: "relationship", relationTo: "training-verslagen", label: "Resulterend trainingsverslag" },
    { name: "ontvangenOp", type: "date", required: true, label: "Ontvangen op" },
    { name: "afgerondOp", type: "date", label: "Afgerond op (concept klaar of mislukt)" },
    {
      // Productieregressie-vervolgronde (2026-08-27, spec "na # hoor ik géén
      // afsluittekst meer") — root cause: het afsluitende "Bedankt..."-bericht
      // werd zowel vanuit het expliciete '#'-pad (verwerkOpnameToets) als
      // vanuit de call.recording.saved-fallback (route.ts, bedoeld voor het
      // geval '#' NOOIT werd ingedrukt) aangeroepen, met hetzelfde
      // deterministische command_id — een tweede, near-simultane speak-poging
      // met identiek command_id kon zo de eerste, daadwerkelijk hoorbare
      // uitspraak verstoren. Dit veld is de atomaire claim (zie
      // oproep-state.ts se claimAfsluitboodschap) die garandeert dat de
      // afsluitboodschap voortaan vanuit precies ÉÉN van de twee triggers
      // wordt gestart, nooit vanuit beide.
      name: "afsluitboodschapGestartOp",
      type: "date",
      label: "Afsluitboodschap gestart op",
      admin: {
        description:
          "Leeg zolang de afsluitboodschap ('Bedankt...') nog niet is gestart. Zodra gezet, geldt dit als de atomaire claim: een eventuele tweede trigger (bv. de call.recording.saved-fallback ná een al via '#' gestarte afsluiting) spreekt de boodschap dan bewust NIET nogmaals uit.",
      },
    },
  ],
};
