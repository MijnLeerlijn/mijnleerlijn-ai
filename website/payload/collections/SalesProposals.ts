import type { CollectionConfig } from "payload";
import { adminOnly, anyEditor } from "../access/roles";

// Sales-assistent V1 (2026-08-14) — AI-voorstellen, twee soorten
// (`proposalType`) die hetzelfde accept/modify/reject-werkstroompatroon
// delen i.p.v. twee aparte systemen:
//   - "volgende_actie": een voorgestelde vervolgstap (backfill of
//     school-AI-chat) — bij acceptatie ontstaat een sales-actions-record.
//   - "veld_correctie": een voorgestelde aanvulling voor een leeg
//     Monday-veld (V1: uitsluitend Type school) — bij acceptatie volgt een
//     write-back naar Monday.
//
// `create`/`update` zijn `() => false` — zelfde audit-integriteitsreden als
// SalesLogEvents: voorstellen ontstaan alleen server-side (AI/backfill), en
// de accept/modify/reject-beslissing loopt via een eigen API-route
// (lib/sales/proposals.ts) die bewust NIET zomaar een PATCH toestaat, omdat
// die beslissing altijd nevenerffecten heeft (actie aanmaken, write-back
// loggen) die niet aan een losse REST-PATCH overgelaten mogen worden.
//
// `finalChoice` bewaart de daadwerkelijke, uiteindelijke keuze van de
// gebruiker WANNEER die afwijkt van het AI-voorstel — het oorspronkelijke
// voorstel (de overige velden) blijft ongewijzigd staan. Beide blijven dus
// bewaard, nooit overschreven — de vereiste auditeerbaarheid.
export const SalesProposals: CollectionConfig = {
  slug: "sales-proposals",
  labels: { singular: "Sales-voorstel", plural: "Sales-voorstellen" },
  admin: {
    useAsTitle: "proposalText",
    defaultColumns: ["school", "proposalType", "status", "confidence", "createdAt"],
    group: "Sales",
    description: "AI-voorstellen (volgende actie of veldcorrectie) — pending totdat een gebruiker beslist.",
  },
  access: {
    read: anyEditor,
    create: () => false,
    update: () => false,
    delete: adminOnly,
  },
  fields: [
    { name: "school", type: "relationship", relationTo: "sales-schools", required: true, label: "School", index: true },
    {
      name: "proposalType",
      type: "select",
      required: true,
      defaultValue: "volgende_actie",
      label: "Soort voorstel",
      options: [
        { label: "Volgende actie", value: "volgende_actie" },
        { label: "Veldcorrectie", value: "veld_correctie" },
        { label: "Bestaande vervolgdatum (Monday)", value: "bestaande_vervolgdatum" },
      ],
      admin: {
        description:
          "'bestaande_vervolgdatum': backfill vond een al ingevulde Datum volgende actie in Monday zonder lokale Sales-actie — de UI toont dan 'Maak Sales-actie'/'Andere datum'/'Negeer' i.p.v. de generieke labels.",
      },
    },
    { name: "proposalText", type: "text", required: true, label: "Voorstel" },
    { name: "reason", type: "text", label: "Onderbouwing" },
    // Alleen relevant bij proposalType "volgende_actie":
    { name: "proposedDate", type: "date", label: "Voorgestelde datum" },
    {
      name: "proposedType",
      type: "select",
      label: "Voorgesteld actietype",
      options: [
        { label: "Mail", value: "mail" },
        { label: "Bellen", value: "bellen" },
        { label: "Afspraak", value: "afspraak" },
        { label: "Voorbereiding", value: "voorbereiding" },
        { label: "Informatie sturen", value: "informatie_sturen" },
        { label: "Anders", value: "anders" },
      ],
    },
    {
      name: "proposedChannel",
      type: "select",
      label: "Voorgesteld kanaal",
      options: [
        { label: "Mail", value: "mail" },
        { label: "Telefoon", value: "telefoon" },
        { label: "In persoon", value: "in_persoon" },
        { label: "Anders", value: "anders" },
      ],
    },
    // Alleen relevant bij proposalType "veld_correctie":
    { name: "targetColumnId", type: "text", label: "Monday column-ID", admin: { readOnly: true, description: "Uitsluitend één van de 3 toegestane write-back-kolommen, zie lib/sales/monday-columns.ts." } },
    { name: "proposedValue", type: "text", label: "Voorgestelde waarde" },
    { name: "mondayValueAtProposalTime", type: "text", label: "Monday-waarde bij voorstel", admin: { readOnly: true, description: "Snapshot voor conflictdetectie bij write-back." } },
    {
      name: "sourceUpdateIds",
      type: "array",
      label: "Bron-updates",
      labels: { singular: "Update", plural: "Updates" },
      admin: { description: "Monday Update-ID's waarop het voorstel is gebaseerd — 'waarop de conclusie gebaseerd is'." },
      fields: [{ name: "updateId", type: "text", required: true }],
    },
    {
      name: "confidence",
      type: "select",
      label: "Zekerheid",
      options: [
        { label: "Hoog", value: "hoog" },
        { label: "Middel", value: "middel" },
        { label: "Laag", value: "laag" },
      ],
      admin: { description: "'Laag' wordt nooit in de UI getoond (zie lib/sales/enrichment.ts) — hier alleen ter volledigheid/audit bewaard." },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "pending",
      label: "Status",
      options: [
        { label: "In afwachting", value: "pending" },
        { label: "Geaccepteerd", value: "accepted" },
        { label: "Aangepast geaccepteerd", value: "modified" },
        { label: "Afgewezen", value: "rejected" },
        { label: "Conflict bij write-back", value: "conflict" },
      ],
    },
    { name: "finalChoice", type: "json", label: "Definitieve keuze", admin: { description: "Alleen gezet bij 'modified' — de daadwerkelijke waarde/datum/type die de gebruiker koos." } },
    { name: "decidedBy", type: "relationship", relationTo: "users", label: "Beslist door" },
    { name: "decidedAt", type: "date", label: "Beslist op" },
    { name: "resultingAction", type: "relationship", relationTo: "sales-actions", label: "Resulterende actie" },
  ],
};
