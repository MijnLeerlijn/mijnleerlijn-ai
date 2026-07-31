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
// eenmalige migratie vanuit de bestaande brontekst).
//
// Kennisbasis per variant (2026-07-31): NIET MEER DE ACTIEVE BRON. De
// inhoud is 1-op-1 overgezet naar een per-variant achtergronddocument (zie
// payload/seed/migreer-kennisbasis-naar-variant.ts en lib/assistant/
// kennisbasis-context.ts, dat nu per actieve variant leest i.p.v. altijd
// deze Global). Dit Global-record blijft bewust ongewijzigd bestaan — puur
// voor rollback/databehoud — maar is `admin.hidden` (uit de navigatie) en
// wordt door geen enkel leespad meer gebruikt.
export const KennisbasisMijnleerlijn: GlobalConfig = {
  slug: "kennisbasis-mijnleerlijn",
  label: "Kennisbasis MijnLeerlijn",
  admin: {
    group: "Kennisbasis MijnLeerlijn",
    hidden: true,
    description:
      "NIET MEER ACTIEF GEBRUIKT — vervangen door het per-variant achtergronddocument, zie het nieuwe 'Kennisbasis'-scherm onder Varianten. Deze Global blijft uitsluitend bestaan voor rollback/databehoud.",
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
