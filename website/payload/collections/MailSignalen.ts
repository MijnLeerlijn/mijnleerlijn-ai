import type { CollectionConfig } from "payload";
import { anyEditor, ownRecordAccess } from "../access/roles";

// Mijn Werk Fase 3 (2026-08-17) — onthoudt uitsluitend de classificatie-
// UITKOMST + workflowstatus van een Gmail-bericht, nooit de inhoud: geen
// afzender/onderwerp/body hier, uitsluitend een pointer (`gmailMessageId` +
// `gmailThreadId`, nodig voor threading bij het versturen van een antwoord)
// plus een korte gecachte reden en wat de gebruiker ermee deed. Zelfde
// "pointer + status, nooit event-inhoud"-patroon als VoorbereidingSignalen.ts
// (daar Calendar-events, hier Gmail-berichten) — afzender/onderwerp/tijd
// worden bij elke weergave live bij Gmail opgehaald (lib/werk/mail-signalen.ts),
// nooit hier bewaard.
//
// Een rij bestaat voor ELK geclassificeerd bericht, ook status "niet_relevant"
// (AI-uitkomst: geen actie nodig) — dat is bewust geen weglaatbare status:
// zonder deze rij zou hetzelfde bericht bij elke volgende dashboardlezing
// (zolang het binnen het lookbackvenster valt) opnieuw geclassificeerd
// worden. "gedempt" is de tegenhanger voor een bericht dat de AI wél als
// actie-behoevend zag, maar de gebruiker zelf wegklikte ("Niet relevant"-knop) —
// bewust een apart statuswoord van "niet_relevant" (AI-uitkomst) zodat een
// toekomstige her-classificatie van iets anders die twee nooit door elkaar haalt.
//
// Eigenaar-gescoped zoals PersonalTasks.ts/VoorbereidingSignalen.ts
// (create: anyEditor + hook): elke schrijfactie hier komt uit een echte,
// ingelogde dashboardsessie (classificatie-lezing of een knop aanklikken),
// dus is er altijd een bruikbare req.user.
export const MailSignalen: CollectionConfig = {
  slug: "mail-signalen",
  labels: { singular: "Mailsignaal", plural: "Mailsignalen" },
  admin: {
    useAsTitle: "gmailMessageId",
    defaultColumns: ["gmailMessageId", "status", "school", "eigenaar"],
    group: "Mijn Werk — systeem",
    description: "Gecachete classificatie + status per Gmail-bericht (actie nodig/gedempt/taak aangemaakt) — uitsluitend zichtbaar voor de eigenaar. Beheer via het Mijn Werk-dashboard, niet deze lijst.",
  },
  access: {
    read: ownRecordAccess,
    create: anyEditor,
    update: ownRecordAccess,
    delete: ownRecordAccess,
  },
  fields: [
    {
      name: "gmailMessageId",
      type: "text",
      required: true,
      label: "Gmail-bericht-ID",
      admin: { description: "Geen andere berichtgegevens worden hier bewaard — afzender/onderwerp/tijd worden live opgehaald." },
    },
    {
      name: "gmailThreadId",
      type: "text",
      required: true,
      label: "Gmail-thread-ID",
      admin: { description: "Nodig om een antwoord correct in dezelfde conversatie te laten verschijnen." },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "gesignaleerd",
      label: "Status",
      options: [
        { label: "Niet relevant (AI-classificatie)", value: "niet_relevant" },
        { label: "Gesignaleerd", value: "gesignaleerd" },
        { label: "Niet relevant (gebruiker)", value: "gedempt" },
        { label: "Taak aangemaakt", value: "taak_aangemaakt" },
        { label: "Beantwoord", value: "beantwoord" },
      ],
    },
    {
      name: "reden",
      type: "text",
      label: "Reden (gecachet)",
      admin: { description: "Korte, door AI gegenereerde reden waarom actie nodig is (of niet) — zie lib/werk/mail-classificatie.ts. Wordt maximaal één keer per bericht gegenereerd." },
    },
    {
      name: "geclassificeerdOp",
      type: "date",
      label: "Geclassificeerd op",
      admin: { readOnly: true },
    },
    {
      name: "school",
      type: "relationship",
      relationTo: "sales-schools",
      label: "Herkende school (context)",
      admin: { description: "Alleen gezet bij een betrouwbare match — zie lib/werk/school-matching.ts." },
    },
    {
      name: "gekoppeldeTaak",
      type: "relationship",
      relationTo: "personal-tasks",
      label: "Gekoppelde taak",
      admin: { description: "Gezet zodra 'Maak taak' een personal-task aanmaakte vanuit dit mailsignaal." },
    },
    {
      name: "beantwoordOp",
      type: "date",
      label: "Beantwoord op",
      admin: { readOnly: true, description: "Gezet zodra een antwoord daadwerkelijk verstuurd is — nooit de verzonden tekst zelf." },
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
  indexes: [{ fields: ["eigenaar", "gmailMessageId"], unique: true }],
  hooks: {
    beforeChange: [
      ({ operation, data, req }) => {
        if (operation === "create" && req.user) data.eigenaar = req.user.id;
        return data;
      },
    ],
  },
};
