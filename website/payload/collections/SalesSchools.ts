import type { CollectionConfig } from "payload";
import { adminOnly, anyEditor } from "../access/roles";

// Sales-assistent V1 (2026-08-14) — de koppel-/referentielaag naar Monday
// board "1: Scholen (Master Data)" (18420120365, zie lib/sales/monday-
// columns.ts). Monday blijft bron van waarheid: dit is BEWUST geen volledige
// lokale kopie, alleen de velden die de Sales-assistent zelf nodig heeft.
//
// `mondayItemId` is de stabiele externe sleutel — nooit schoolnaam (kan
// wijzigen/dubbel voorkomen, zie de sessie-analyse §21).
//
// `contactpersoonNaam` is BEWUST beperkt tot de naam die Monday's
// board_relation-kolom zelf al meegeeft (het gekoppelde item op board
// "8: Contactpersonen" heeft altijd minstens een id+naam, ongeacht welke
// andere kolommen dat board heeft) — board 8 is deze sessie niet onderzocht,
// dus wordt hier GEEN e-mailadres/telefoonnummer-veld verzonnen. Zie
// lib/sales/sync.ts.
//
// `onderwijstype` (bijgewerkt Sales UX-ronde 3, 2026-08-14): WEL direct
// gesynchroniseerd wanneer Monday's "Type school"-dropdown een waarde heeft
// die 1-op-1 matcht met een bestaande variants.educationType
// (lib/sales/education-type-sync.ts) — root cause van de eerdere "Sync nu
// vult Onderwijstype niet bij" was dat deze koppeling simpelweg niet
// bestond. Een lege Monday-cel laat een al gezette waarde altijd met rust;
// een niet-mapbaar label wordt evenmin overschreven (wel gelogd, zie
// SyncResultaat.onderwijstypeOnbekend). Daarnaast blijft het OOK handmatig
// zetbaar, of via een bevestigd AI-veldvoorstel (lib/sales/enrichment.ts —
// leidt het type af uit vrije contactnotities, voor het geval de
// Monday-dropdown zelf leeg is; slaat zichzelf al over zodra dit veld gezet
// is). Leeg = geen variant-specifieke context, geen aanname.
export const SalesSchools: CollectionConfig = {
  slug: "sales-schools",
  labels: { singular: "Sales-school", plural: "Sales-scholen" },
  admin: {
    useAsTitle: "schoolName",
    defaultColumns: ["schoolName", "relatiestatus", "salesfase", "onderwijstype", "lastMondayActivityAt"],
    group: "Sales — systeem",
    description: "Referentielaag naar Monday board '1: Scholen (Master Data)'. Monday blijft bron van waarheid.",
  },
  access: {
    read: anyEditor,
    create: adminOnly,
    update: anyEditor,
    delete: adminOnly,
  },
  fields: [
    { name: "mondayItemId", type: "text", required: true, unique: true, label: "Monday item-ID", admin: { readOnly: true } },
    { name: "mondayBoardId", type: "text", required: true, label: "Monday board-ID", admin: { readOnly: true } },
    { name: "schoolName", type: "text", required: true, label: "Schoolnaam" },
    { name: "plaats", type: "text", label: "Plaats" },
    {
      name: "contactpersoonNaam",
      type: "text",
      label: "Hoofdcontactpersoon (naam)",
      admin: { description: "Alleen de naam uit Monday's board_relation-koppeling naar 8: Contactpersonen — geen e-mail/telefoon (board 8 nog niet onderzocht)." },
    },
    {
      name: "onderwijstype",
      type: "relationship",
      relationTo: "variants",
      label: "Onderwijstype/variant",
      admin: { description: "Leeg = geen variant-specifieke context. Wordt bij sync automatisch bijgewerkt zodra Monday's 'Type school' een bekende variant matcht — anders alleen handmatig of via een bevestigd AI-veldvoorstel." },
    },
    { name: "relatiestatus", type: "text", label: "Relatiestatus (Monday)", index: true, admin: { readOnly: true, description: "Ruwe waarde uit color_mm4vvg4r. Geïndexeerd — dit is het primaire filter voor 'openstaand' in lib/sales/backfill.ts." } },
    { name: "salesfase", type: "text", label: "Salesfase (Monday)", admin: { readOnly: true, description: "Ruwe waarde uit color_mm4vkv86." } },
    { name: "lastMondaySyncAt", type: "date", label: "Laatst gesynchroniseerd", admin: { readOnly: true } },
    { name: "lastMondayActivityAt", type: "date", label: "Laatste Monday-activiteit", admin: { readOnly: true } },
    {
      name: "mondayVolgendeActieDatum",
      type: "date",
      label: "Datum volgende actie (Monday)",
      admin: { readOnly: true, description: "Cache van date_mm5qswfk — voorkomt een live Monday-call per school in backfill/Vandaag. Bron van waarheid blijft Monday." },
    },
    {
      name: "actief",
      type: "checkbox",
      defaultValue: true,
      label: "Actief (openstaand)",
      admin: { description: "Relatiestatus ∈ {Lead, Prospect, Wacht op handtekening} — zie lib/sales/backfill.ts." },
    },
    {
      name: "cachedSummary",
      type: "textarea",
      label: "Samenvatting (gecached)",
      admin: {
        readOnly: true,
        description:
          "AI-samenvatting van 'waar staan we' — door scrubPotentialPii gehaald vóór opslag (lib/sales/context.ts se genereerSchoolSamenvatting). Wordt opnieuw gegenereerd zodra sync nieuwe, betrouwbare Monday-activiteit vindt — nooit bij elke paginaweergave.",
      },
    },
    {
      name: "cachedSummaryGeneratedAt",
      type: "date",
      label: "Samenvatting gegenereerd op",
      admin: { readOnly: true },
    },
  ],
};
