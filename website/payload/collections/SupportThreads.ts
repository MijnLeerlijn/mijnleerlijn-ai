import type { CollectionConfig } from "payload";
import { adminOnly } from "../access/roles";

// Geïmporteerde Gmail-helpdesk-threads (lib/gmail/sync.ts, app/api/gmail/sync)
// — bevat persoonsgegevens van ouders/leerkrachten die de helpdesk mailen,
// dus bewust volledig admin-only (geen enkele publieke of editor-toegang).
// Schrijven gebeurt uitsluitend door de sync-service (overrideAccess: true,
// zelfde patroon als ContactSubmissions/AnswerFeedback/GmailConnection) —
// `create`/`update` staan hier dicht voor de normale API zodat een
// synchronisatie nooit buiten de eigen route om kan worden aangeroepen.
// De aiAnalysis*-velden worden uitsluitend geschreven door lib/support/
// analyze.ts (via app/api/support/analyze) — zie dat bestand voor de
// volledige analyse-/privacylogica.
export const SupportThreads: CollectionConfig = {
  slug: "support-threads",
  admin: {
    useAsTitle: "subject",
    defaultColumns: [
      "subject",
      "participants",
      "messageCount",
      "status",
      "aiAnalysisStatus",
      "lastMessageAt",
    ],
    group: "Beheer",
    description: "Geïmporteerde Gmail-helpdesk-threads (alleen-lezen buiten de synchronisatie om).",
    components: {
      // "Analyseer geselecteerde threads" — rendert binnen de SelectionProvider
      // van de lijstweergave, zie payload/components/AnalyzeSelectedThreadsButton.tsx.
      listMenuItems: ["@/payload/components/AnalyzeSelectedThreadsButton#AnalyzeSelectedThreadsButton"],
    },
  },
  access: {
    read: adminOnly,
    create: () => false,
    update: adminOnly,
    delete: adminOnly,
  },
  indexes: [{ fields: ["gmailThreadId"], unique: true }],
  fields: [
    {
      name: "gmailThreadId",
      type: "text",
      required: true,
      unique: true,
      index: true,
      label: "Gmail-thread-ID",
      admin: { readOnly: true, description: "Voorkomt dubbele import — zie lib/gmail/sync.ts." },
    },
    { name: "subject", type: "text", label: "Onderwerp", admin: { readOnly: true } },
    {
      name: "participants",
      type: "text",
      hasMany: true,
      label: "Deelnemers",
      admin: { readOnly: true, description: "Unieke e-mailadressen uit van/aan/cc van alle berichten." },
    },
    { name: "firstMessageAt", type: "date", label: "Eerste bericht op", admin: { readOnly: true } },
    { name: "lastMessageAt", type: "date", label: "Laatste bericht op", admin: { readOnly: true } },
    { name: "messageCount", type: "number", label: "Aantal berichten", admin: { readOnly: true } },
    { name: "snippet", type: "text", label: "Voorbeeldtekst", admin: { readOnly: true } },
    {
      name: "messages",
      type: "array",
      label: "Berichten",
      labels: { singular: "Bericht", plural: "Berichten" },
      admin: { readOnly: true },
      fields: [
        { name: "gmailMessageId", type: "text", required: true, label: "Gmail-bericht-ID" },
        { name: "from", type: "text", label: "Van" },
        { name: "to", type: "text", hasMany: true, label: "Aan" },
        { name: "cc", type: "text", hasMany: true, label: "Cc" },
        { name: "sentAt", type: "date", label: "Verzonden op" },
        { name: "subject", type: "text", label: "Onderwerp" },
        {
          name: "bodyText",
          type: "textarea",
          label: "Berichttekst",
          admin: {
            description:
              "Platte tekst (HTML omgezet). Citaten/handtekeningen bewust niet agressief verwijderd.",
          },
        },
      ],
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "new",
      label: "Triagestatus",
      options: [
        { label: "Nieuw", value: "new" },
        { label: "Bekeken", value: "reviewed" },
        { label: "Genegeerd", value: "ignored" },
        { label: "Afgehandeld", value: "processed" },
      ],
      admin: { description: "Handmatig door een beheerder te zetten — de sync zelf wijzigt dit nooit." },
    },
    {
      name: "importedAt",
      type: "date",
      label: "Eerst geïmporteerd op",
      admin: { readOnly: true },
    },
    {
      name: "updatedFromGmailAt",
      type: "date",
      label: "Laatst bijgewerkt vanuit Gmail",
      admin: { readOnly: true },
    },
    {
      name: "aiAnalysisStatus",
      type: "select",
      required: true,
      defaultValue: "not-analyzed",
      label: "AI-analysestatus",
      options: [
        { label: "Niet geanalyseerd", value: "not-analyzed" },
        { label: "Bezig met analyseren", value: "analyzing" },
        { label: "Geanalyseerd", value: "analyzed" },
        { label: "Mislukt", value: "failed" },
        { label: "Genegeerd", value: "ignored" },
      ],
      admin: {
        readOnly: true,
        description:
          "'Genegeerd' = de AI vond de thread te specifiek, onduidelijk of onopgelost (reden in aiAnalysisError) — geen concept aangemaakt. 'Mislukt' = technische fout tijdens analyse, nooit ten onrechte op 'Geanalyseerd' gezet.",
      },
    },
    {
      name: "aiAnalysisError",
      type: "textarea",
      label: "Analysefout of reden voor negeren",
      admin: {
        readOnly: true,
        description:
          "Alleen technische foutmeldingen of AI-redenering — nooit berichtinhoud of persoonsgegevens.",
      },
    },
    {
      name: "knowledgeDrafts",
      type: "relationship",
      relationTo: "knowledge-drafts",
      hasMany: true,
      label: "Conceptkennisartikelen",
      admin: { readOnly: true, description: "Concepten die (mede) uit deze thread zijn ontstaan." },
    },
    {
      name: "analyzedAt",
      type: "date",
      label: "Geanalyseerd op",
      admin: { readOnly: true },
    },
  ],
};
