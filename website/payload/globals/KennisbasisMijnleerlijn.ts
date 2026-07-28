import type { GlobalConfig } from "payload";
import {
  lexicalEditor,
  BoldFeature,
  HeadingFeature,
  LinkFeature,
  OrderedListFeature,
  UnorderedListFeature,
  ParagraphFeature,
} from "@payloadcms/richtext-lexical";
import { anyEditor } from "../access/roles";

// Kennisbasis MijnLeerlijn — Fase 3 (2026-07-28): het centrale, bewerkbare
// achtergronddocument voor de Helpdesk AI, als Payload GLOBAL (geen
// collection) — een Global garandeert van zichzelf al precies één document
// (geen lijstweergave, geen "Create New"-knop, klikken op het menu-item
// opent direct dit ene document), exact de singleton die gevraagd is, zonder
// eigen afdwingingscode. Vervangt NIET de bestaande `kennisbasis-onderwerpen`
// -collectie (zie KennisbasisOnderwerpen.ts, hernoemd naar
// "Helpdesk-onderwerpen") — die blijft intentie-/officiële-termconfiguratie,
// dit is het narratieve achtergrondverhaal zelf.
//
// `versions: { drafts: true }` i.p.v. een handmatig status/versie-veld:
// geeft automatisch concept/gepubliceerd-status (`_status`) én volledige
// versiehistorie — zie payload/seed/migrate-kennisbasis-global.ts (de
// eenmalige migratie vanuit de bestaande brontekst) en
// lib/assistant/kennisbasis-context.ts (leest altijd de GEPUBLICEERDE stand,
// nooit een concept, voor de Helpdesk AI-promptcontext).
export const KennisbasisMijnleerlijn: GlobalConfig = {
  slug: "kennisbasis-mijnleerlijn",
  label: "Kennisbasis MijnLeerlijn",
  admin: {
    group: "Kennisbasis MijnLeerlijn",
    description:
      "Het centrale achtergrondverhaal voor de Helpdesk AI — visie, samenhang en productlogica. Wordt bij elke helpdeskvraag als vaste achtergrondcontext gebruikt (naast de handleidingen voor concrete stappen). Alleen de gepubliceerde stand wordt door de AI gelezen.",
  },
  access: {
    read: anyEditor,
    update: anyEditor,
  },
  versions: {
    drafts: true,
    max: 50,
  },
  fields: [
    {
      name: "titel",
      type: "text",
      required: true,
      label: "Titel",
      defaultValue: "Kennisbasis MijnLeerlijn — achtergrondverhaal voor de Helpdesk AI",
    },
    {
      name: "inhoud",
      type: "richText",
      required: true,
      label: "Inhoud",
      editor: lexicalEditor({
        features: () => [
          ParagraphFeature(),
          HeadingFeature({ enabledHeadingSizes: ["h2", "h3"] }),
          BoldFeature(),
          LinkFeature(),
          UnorderedListFeature(),
          OrderedListFeature(),
        ],
      }),
      admin: {
        description:
          "De volledige tekst van het achtergrondverhaal. Koppen en lijsten blijven herkenbaar voor de AI — zie lib/assistant/kennisbasis-context.ts.",
      },
    },
  ],
};
