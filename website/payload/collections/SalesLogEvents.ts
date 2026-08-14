import type { CollectionConfig } from "payload";
import { adminOnly, anyEditor } from "../access/roles";

// Sales-assistent V1 (2026-08-14) — chronologisch logboek per school, dient
// ook als audittrail (er bestaat geen generieke Payload AuditLog-collectie
// in deze codebase — DATA-MODEL.md documenteert het concept, maar het is
// nooit gebouwd; deze collectie vervult die rol specifiek voor Sales).
//
// `create`/`update` zijn BEWUST `() => false` — zelfde patroon als
// KnowledgeDrafts.ts: audit-integriteit vereist dat logregels alleen
// server-side, na een eigen autorisatiecontrole, met overrideAccess
// ontstaan (sync/AI/write-back-services), nooit vrij via de publieke
// REST-API of achteraf bewerkbaar.
//
// Dataminimalisatie (expliciete eis): `payload` bevat GEEN volledige ruwe
// Monday-updatetekst tenzij daar een concrete, gedocumenteerde reden voor is
// (zie lib/sales/sync.ts) — standaard alleen `sourceExternalId` + een korte
// `summary` + eventuele structured extractievelden. AI-context die de volle
// Update-tekst nodig heeft (school-chat, verrijking, backfill-redenering)
// haalt die LIVE op bij Monday op het moment zelf (lib/sales/context.ts) —
// nooit een tweede, lokale kopie van de ruwe CRM-tekst bewaren die niet
// nodig is.
export const SalesLogEvents: CollectionConfig = {
  slug: "sales-log-events",
  labels: { singular: "Sales-logregel", plural: "Sales-logboek" },
  admin: {
    useAsTitle: "summary",
    defaultColumns: ["school", "type", "occurredAt", "source", "summary"],
    group: "Sales",
    description: "Chronologisch logboek per school — audittrail voor Sales-acties/voorstellen/write-backs.",
  },
  access: {
    read: anyEditor,
    create: () => false,
    update: () => false,
    delete: adminOnly,
  },
  fields: [
    { name: "school", type: "relationship", relationTo: "sales-schools", required: true, label: "School", index: true },
    { name: "occurredAt", type: "date", required: true, label: "Wanneer" },
    {
      name: "type",
      type: "select",
      required: true,
      label: "Type",
      options: [
        { label: "Contact", value: "contact" },
        { label: "Mail", value: "mail" },
        { label: "Afspraak", value: "afspraak" },
        { label: "Monday-statuswijziging", value: "monday_status" },
        { label: "AI-voorstel", value: "ai_voorstel" },
        { label: "Actie gepland", value: "actie_gepland" },
        { label: "Actie aangepast", value: "actie_aangepast" },
        { label: "Actie afgerond", value: "actie_afgerond" },
        { label: "Actie vervallen", value: "actie_vervallen" },
        { label: "Notitie", value: "notitie" },
        { label: "Systeem", value: "systeem" },
        { label: "Monday write-back", value: "monday_writeback" },
      ],
    },
    {
      name: "source",
      type: "select",
      required: true,
      label: "Bron",
      options: [
        { label: "Monday", value: "monday" },
        { label: "Creator", value: "creator" },
        { label: "Sales-AI", value: "sales-ai" },
        { label: "Gebruiker", value: "gebruiker" },
        { label: "Systeem", value: "systeem" },
      ],
    },
    { name: "sourceExternalId", type: "text", label: "Externe bron-ID", admin: { description: "Bijv. Monday update-ID — voor idempotente dedup bij herhaald synchroniseren." } },
    { name: "summary", type: "text", required: true, label: "Samenvatting", admin: { description: "Kort — geen volledige ruwe brontekst, zie dataminimalisatie-eis." } },
    { name: "payload", type: "json", label: "Technische context", admin: { description: "Gestructureerde snapshot (bijv. voorstel-details), nooit volledige ruwe CRM-tekst zonder expliciete reden." } },
    { name: "actor", type: "relationship", relationTo: "users", label: "Door wie", admin: { description: "Leeg bij pure Monday-sync/systeemgebeurtenissen." } },
    { name: "relatedAction", type: "relationship", relationTo: "sales-actions", label: "Gekoppelde actie" },
    { name: "relatedProposal", type: "relationship", relationTo: "sales-proposals", label: "Gekoppeld voorstel" },
    {
      name: "relatedMailDraft",
      type: "relationship",
      relationTo: "mail-drafts",
      label: "Gekoppeld mailconcept",
      admin: { description: "Verwijzing naar het bestaande mail-drafts-record — de volledige mailtekst wordt hier NOOIT gedupliceerd, alleen een korte summary (bv. 'Mailconcept gemaakt · Onderwerp')." },
    },
  ],
};
